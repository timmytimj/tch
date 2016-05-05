
import urlParser from '../util/url'
import dns from 'dns'
import querystring from 'querystring'

const ITCH_HOST_RE = /^([^.]+)\.(itch\.io|localhost\.com:8080)$/
const ID_RE = /^[^\/]+\/(.+)$/

export async function transformUrl (original) {
  if (/^about:/.test(original)) {
    return original
  }

  let req = original
  let parsed = urlParser.parse(req)
  const searchUrl = () => {
    const q = original
    return 'https://duckduckgo.com/?' + querystring.stringify({q, kae: 'd'})
  }

  if (!parsed.hostname) {
    req = 'http://' + original
    parsed = urlParser.parse(req)
    if (!parsed.hostname) {
      return searchUrl()
    }
  }

  return await new Promise((resolve, reject) => {
    dns.lookup(parsed.hostname, (err) => {
      if (err) {
        resolve(searchUrl())
      }
      resolve(req)
    })
  })
}

export function pathToId (path) {
  const matches = ID_RE.exec(path)
  if (!matches) {
    throw new Error('Could not extract id from path: ', path)
  }
  return matches[1]
}

export function pathToIcon (path) {
  if (path === 'featured') {
    return 'itchio'
  }
  if (path === 'dashboard') {
    return 'rocket'
  }
  if (path === 'press') {
    return 'newspaper-o'
  }
  if (path === 'library') {
    return 'heart-filled'
  }
  if (path === 'preferences') {
    return 'cog'
  }
  if (path === 'history') {
    return 'history'
  }
  if (path === 'downloads') {
    return 'download'
  }
  if (/^collections/.test(path)) {
    return 'video_collection'
  }
  if (/^games/.test(path)) {
    return 'star'
  }
  if (/^users/.test(path)) {
    return 't-shirt'
  }
  if (/^search/.test(path)) {
    return 'search'
  }
  if (/^locations/.test(path)) {
    return 'folder'
  }
  if (/^new/.test(path)) {
    return 'star2'
  }
  return 'earth'
}

export function gameToTabData (game) {
  return {
    games: {
      [game.id]: game
    },
    label: game.title,
    subtitle: game.shortText,
    image: game.coverUrl,
    imageClass: 'game',
    iconImage: game.coverUrl
  }
}

export function userToTabData (user) {
  return {
    users: {
      [user.id]: user
    },
    label: user.displayName || user.username,
    image: user.coverUrl,
    imageClass: 'user',
    iconImage: user.coverUrl
  }
}

export function collectionToTabData (collection) {
  return {
    collections: {
      [collection.id]: collection
    },
    label: collection.title
  }
}

export function locationToTabData (location) {
  return {
    label: location.path
  }
}

export function isAppSupported (url) {
  const {host, pathname} = urlParser.parse(url)

  if (ITCH_HOST_RE.test(host)) {
    const pathItems = pathname.split('/')
    if (pathItems.length === 2) {
      if (pathItems[1].length > 0) {
        // xxx.itch.io/yyy
        return 'game'
      } else {
        // xxx.itch.io
        return 'user'
      }
    }
  }

  return null
}

export default {transformUrl, pathToId, pathToIcon, gameToTabData, collectionToTabData, isAppSupported}
