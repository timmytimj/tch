import env from "common/env";
import dump from "common/util/dump";
import { getRendererDistPath } from "common/util/resources";
import { protocol, session } from "electron";
import * as fs from "fs";
import * as http from "http";
import { MainState } from "main";
import { mainLogger } from "main/logger";
import mime from "mime-types";
import * as filepath from "path";
import { Readable } from "stream";

let logger = mainLogger.childWithName("itch-protocol");

class HTTPError extends Error {
  constructor(
    public statusCode: number,
    public headers: { [key: string]: string },
    public data: string
  ) {
    super(`HTTP ${statusCode}`);
  }
}

function convertHeaders(
  input: http.IncomingHttpHeaders
): Record<string, string> {
  let output: Record<string, string> = {};
  for (const k of Object.keys(input)) {
    const v = input[k];
    switch (typeof v) {
      case "string":
        output[k] = v;
        break;
      case "object":
        output[k] = v[0];
        break;
    }
  }
  return output;
}

export function prepareItchProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "itch",
      privileges: {
        supportFetchAPI: true,
        secure: true,
        standard: true,
        corsEnabled: true,
      },
    },
  ]);
}

let partitionsRegistered: {
  [key: string]: boolean;
} = {};

export async function registerItchProtocol(ms: MainState, partition: string) {
  if (partitionsRegistered[partition]) {
    logger.debug(`Already registered itch: for partition ${partition}`);
    return;
  }

  logger.debug(`Registering itch: for partition ${partition}`);

  let handler = getItchProtocolHandler(ms);
  let ses = session.fromPartition(partition);
  ses.protocol.registerStreamProtocol("itch", handler);
  partitionsRegistered[partition] = true;
}

type ProtocolHandler = (
  req: Electron.Request,
  cb: (stream: Electron.StreamProtocolResponse) => void
) => void;
let protocolHandler: undefined | ProtocolHandler;

export function getItchProtocolHandler(ms: MainState): ProtocolHandler {
  if (protocolHandler) {
    logger.debug(`Using cached protocol handler`);
    return protocolHandler;
  }
  logger.debug(`Building protocol handler`);

  async function handleAPIRequest(
    req: Electron.Request,
    elements: string[]
  ): Promise<Object> {
    let forbiddenCause: string | null = null;
    let originKey = Object.keys(req.headers).find(
      x => x.toLowerCase() == "origin"
    );
    if (originKey) {
      let origin = req.headers[originKey]!;
      if (!origin.startsWith("itch:")) {
        forbiddenCause = `Forbidden origin ${origin}`;
      }
    } else {
      forbiddenCause = `Missing origin`;
    }

    if (forbiddenCause) {
      throw new HTTPError(
        403,
        {
          "content-type": "text/plain",
          "access-control-allow-origin": "*",
        },
        forbiddenCause
      );
    }

    if (elements.length === 1 && elements[0] === "websocket-address") {
      let ws = ms.websocket;
      if (!ws) {
        throw new Error(`WebSocket not initialized yet! (this is a bug)`);
      }

      return {
        address: ws.address,
        secret: ws.secret,
      };
    }

    throw new HTTPError(404, {}, "API route not found");
  }

  async function handleRequest(
    req: Electron.Request
  ): Promise<Electron.StreamProtocolResponse> {
    logger.debug(`[${req.method}] ${req.url}`);
    let url = new URL(req.url);

    let route = [url.hostname, url.pathname.replace(/^\//, "")]
      .filter(s => s.length > 0)
      .join("/");
    let elements = route.split("/");

    let firstEl = elements[0];
    elements = elements.slice(1);

    switch (firstEl) {
      case "api": {
        try {
          let payload = await handleAPIRequest(req, elements);
          return {
            statusCode: 200,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
            },
            data: asReadable(JSON.stringify(payload)),
          };
        } catch (e) {
          if (e instanceof HTTPError) {
            return {
              statusCode: e.statusCode,
              headers: e.headers,
              data: asReadable(e.data),
            };
          } else {
            return {
              statusCode: 500,
              headers: {
                "content-type": "text/plain",
                "access-control-allow-origin": "*",
              },
              data: asReadable(`Internal error: ${e.stack}`),
            };
          }
        }
      }
      default: {
        if (elements.length == 0 || elements[0] != "assets") {
          elements = ["assets", "index.html"];
        }

        if (env.development) {
          // not listed in env-settings because it's an internal webpack thing
          let port = process.env.ELECTRON_WEBPACK_WDS_PORT;
          const upstream = `http://localhost:${port}/${elements.join("/")}`;
          let res = await new Promise<http.IncomingMessage>(
            (resolve, reject) => {
              http.get(upstream, res => {
                resolve(res);
              });
            }
          );

          let headers = convertHeaders(res.headers);
          headers["cache-control"] = "no-cache";
          headers["access-control-allow-origin"] = "*";
          return {
            statusCode: res.statusCode,
            headers,
            data: res,
          };
        } else {
          let fsPath = filepath.join(getRendererDistPath(), ...elements);

          let contentType = mime.lookup(fsPath) || "application/octet-stream";
          // N.B: electron 7.1.2 release notes says custom stream handlers
          // should work now, but it doesn't appear to be the case, so
          // `createReadStream` is out of the question for now. Ah well.
          let content = await new Promise<Buffer>((resolve, reject) => {
            fs.readFile(
              fsPath,
              { encoding: null /* binary */ },
              (err, data) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(data);
                }
              }
            );
          });

          return {
            statusCode: 200,
            headers: {
              server: env.appName,
              "content-length": `${content.length}`,
              "content-type": contentType,
              "access-control-allow-origin": "*",
              "cache-control": "public, max-age=31536000",
            },
            data: asReadable(content),
          };
        }
        break;
      }
    }
  }

  protocolHandler = (req, cb) => {
    handleRequest(req)
      .then(res => {
        cb(res);
      })
      .catch(e => {
        cb({
          statusCode: 500,
          headers: {
            "content-type": "text/plain",
          },
          data: asReadable(e.stack),
        });
      });
  };
  return protocolHandler;
}

export function asReadable(payload: string | Buffer): Readable {
  const data = new Readable();
  data.push(payload);
  data.push(null);
  return data;
}