
if (process.type === "renderer") {
  throw new Error("can't require db from renderer.");
}

import {elapsed} from "../format";
import {dirname} from "path";
import sf from "../os/sf";

import rootLogger from "../logger";
const logger = rootLogger.child({name: "db"});

import getColumns from "./get-columns";

import {
  createConnection,
  Connection, ObjectType, Repository,
} from "typeorm";

import {modelMap} from "./model-map";

import compareRecords from "./compare-records";
import * as _ from "underscore";

import {globalDbPath} from "../os/paths";

import store from "../store/metal-store";
import * as actions from "../actions";

import {
  IEntityMap, ITableMap,
  IDBDeleteSpec,
} from "../types";

/**
 * DB is a thin abstraction on top of typeorm. Pierce through it at will!
 */
export class DB {
  conn: Connection;

  /** path to the sqlite file on disk */
  dbPath: string;

  /**
   * Loads the db from disk.
   */
  async load (dbPath: string): Promise<void> {
    logger.info(`connecting to db ${dbPath}`);
    const t1 = Date.now();
    this.dbPath = dbPath;

    try {
      await sf.mkdir(dirname(this.dbPath));
    } catch (e) {
      logger.warn(`could not make db parent directory: ${e.stack}`);
    }

    // sqlite init
    this.conn = await createConnection({
      name: dbPath,
      driver: {
        type: "sqlite",
        storage: dbPath,
      },
      logging: {
        logQueries: process.env.ITCH_SQL === "1",
      },
      entities: Object.keys(modelMap).map((k) => modelMap[k]),
      autoSchemaSync: true,
    });

    logger.info(`db connection established in ${elapsed(t1, Date.now())}`);
  }

  /* Data persistence / retrieval */

  /**
   * Saves all passed entity records. See opts type for disk persistence and other options.
   */
  async saveMany (entityTables: ITableMap) {
    for (const tableName of Object.keys(entityTables)) {
      const entities: IEntityMap<Object> = entityTables[tableName];
      const entityIds = Object.keys(entities);

      const Model = modelMap[tableName];
      if (!Model) {
        logger.info(`Dunno how to persist ${tableName}, skipping ${entityIds.length} records`);
        continue;
      }
      const columns = getColumns(Model);

      const repo = this.conn.getRepository(Model);

      const savedRows = await repo
        .createQueryBuilder("e")
        .where("e.id in (:entityIds)", {entityIds})
        .getMany();
      const existingEntities = _.indexBy(savedRows, "id");

      let rows = [];
      let numUpToDate = 0;
      for (const id of entityIds) {
        let entity = entities[id];
        let existingEntity = existingEntities[id];
        if (existingEntity) {
          if (compareRecords(existingEntity, entity, columns)) {
            numUpToDate++;
            continue;
          }
          rows.push(repo.merge(entity));
        } else {
          existingEntity = repo.create(entity);
          (existingEntity as any).id = id;
          rows.push(existingEntity);
        }
      }

      if (rows.length > 0) {
        // TODO: what do we do if this fails?
        await repo.persist(rows);
        store.dispatch(actions.dbCommit({tableName, updated: _.pluck(rows, "id")}));
      }
      logger.info(`saved ${entityIds.length - numUpToDate}/${entityIds.length}`
        + ` ${tableName}, skipped ${numUpToDate} up-to-date`);
    }
  }

  /**
   * Save a single entity to the db, optionally persisting to disk (see ISaveOpts).
   */
  async saveOne <T> (tableName: string, id: string, record: Partial<T>): Promise<void> {
    await this.saveMany({
      [tableName]: {
        [id]: record,
      },
    });
  }

  /**
   * Delete all referenced entities. See IDeleteOpts for options.
   */
  async deleteAllEntities (deleteSpec: IDBDeleteSpec) {
    for (const tableName of Object.keys(deleteSpec.entities)) {
      const entities = deleteSpec.entities[tableName];

      const Model = modelMap[tableName];
      if (!Model) {
        logger.info(`Dunno how to persist ${tableName}, skipping delete of ${entities.length} items`);
        continue;
      }
      const repo = this.conn.getRepository(Model);

      const toRemove = [];      
      for (const id of entities) {
        toRemove.push({id});
      }
      await repo.remove(toRemove);
    }
  }

  /**
   * Deletes a single entity, optionally from the disk store too, see opts type
   */
  async deleteEntity (tableName: string, id: string) {
    const Model = modelMap[tableName];
    if (!Model) {
      logger.info(`Dunno how to persist ${tableName}, skipping single delete`);
      return;
    }
    const repo = this.conn.getRepository(Model);
    await repo.remove({id});
  }

  /**
   * Gets the typeorm repository for a given model
   */
  getRepo <T> (model: ObjectType<T>): Repository<T> {
    return this.conn.getRepository(model);
  }

  /**
   * After closing the DB, no methods may called on it any more.
   */
  async close () {
    logger.info(`closing db ${this.dbPath}`);
    const t1 = Date.now();
    await this.conn.close();
    logger.info(`closed db in ${elapsed(t1, Date.now())}`);
    this.dbPath = null;
  }
}

const db = new DB();

export async function connectDatabase() {
  await db.load(globalDbPath());
}

export default db;
