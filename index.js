const express = require('express')
const app = express()
require('dotenv').config()
const axios = require('axios')

app.use(express.static('dist'))
app.use(express.json())

const cors = require('cors')
app.use(cors())

const fs = require('fs')
const path = require('path')

//check the genres of the given track and return true if they include the given genre
const tagChecker = async (track, genre, dict) => {
  let artist
    
  if (track.artist['#text'].includes(',')) {
    artist = encodeURIComponent(track.artist['#text'].split(',')[0])
  } else {
    artist = encodeURIComponent(track.artist['#text'])
  }

  const key = artist
  if (key in dict) {
    return dict[key]
  }
  const tags = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${artist}&api_key=${process.env.KEY}&format=json`)
  try {
    const taglist = tags.data.toptags.tag
      .filter(tag => tag.count >= 15)
      .map(tag => tag.name)
    dict[key] = taglist.includes(genre)
    return taglist.includes(genre)
  } catch (error) {
    console.log(tags.data)
  }
}

//return users whole listening history from api or local storage
const getRecentTracks = async (username) => {
  const user = username
  const filePath = path.join(__dirname, 'user_data', `${user}_tracks.json`)
  let tracks = []

  if (fs.existsSync(filePath)) {
    console.log('Loading data from file...')
    const fileData = fs.readFileSync(filePath)
    tracks = JSON.parse(fileData)
    return tracks
  } else {
    let page = 1
    console.log(`Fetching page ${page}...`)
    const firstPage = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&limit=500&user=${user}&page=${page}&api_key=${process.env.KEY}&format=json`)
    const pages_count = parseInt(firstPage.data.recenttracks['@attr']['totalPages'])
    tracks = tracks.concat(firstPage.data.recenttracks.track)

    if (pages_count > 1) {
      for (let p = 2; p <= pages_count; p++) {
        console.log(`Fetching page ${p}...`)
        const pageData = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&limit=500&user=${user}&page=${p}&api_key=${process.env.KEY}&format=json`)
        tracks = tracks.concat(pageData.data.recenttracks.track)
        console.log(`Fetched page ${p}`)
      }
    }
    fs.mkdirSync(path.join(__dirname, 'user_data'), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(tracks, null, 2))
    console.log('Data saved to file:', filePath)
    return tracks
  }
}

// Return every song matching with the given genre from user's entire listening history
app.get('/api/genres/:user/:genre', async (request, response) => {
  const tracks = await getRecentTracks(request.params.user)

  console.log('Processing tracks')
  let results = []
  let dict = {}
  const batchSize = 100

  for (let i = 0; i < tracks.length; i += batchSize) {
    console.log(`Processing tracks ${i}-${i + batchSize}`)
    const batch = tracks.slice(i, i + batchSize)

    const promises = batch.map(async (track) => {
      const genre = await tagChecker(track, request.params.genre, dict)
      if (genre) {
        return {
          artist: track.artist['#text'],
          name: track.name
        }
      }
    })

    const filteredTracks = await Promise.all(promises)
    results = results.concat(filteredTracks.filter(track => track !== undefined))
  }
  response.json(results)
})

//return the most listened song of each hour from users entire listening history
app.get('/api/hours/:user/', async (request, response) => {
  const tracks = await getRecentTracks(request.params.user)
  console.log('Processing tracks')
  let dict = {}
  for (let i = 0; i < 24; i++) {
    dict[i] = {}
  }

  for (let i = 0; i < tracks.length; i++) {
    try {
      const key = `${tracks[i]['artist']['#text']} ${tracks[i]['name']}`
      if (key !== 'KekeKik Jyystö Jötikkä Anthem') {
        const date = new Date(tracks[i]['date']['#text'])
        const hour = date.getHours()
        if (!(key in dict[hour])) {
          dict[hour][key] = 0
        }
        dict[hour][key]+=1
      }
    } catch (error) {
      console.log(tracks[i]['name'])
    }
  }

  let result = {}
  for (let hour in dict) {
    let maxPlays = 0
    let topTrack = ''

    for (let key in dict[hour]) {
      if (dict[hour][key] > maxPlays) {
        maxPlays = dict[hour][key]
        topTrack = `${key} kuunneltu ${maxPlays} kertaa`
      }
    }
    result[hour] = topTrack
  }

  response.json(result)
  console.log('Success  :)')
})

//return the amount of unique tracks the user has scrobbled
app.get('/api/uniquetracks/:user/', async (request, response) => {
  const tracks = await getRecentTracks(request.params.user)
  const trackNames = tracks.map(track => {
    return `${track["artist"]["#text"]} ${track["name"]}`
  })
  const result = new Set(trackNames)
  response.json(result.size)
})

const errorHandler = (error, request, response, next) => {
  console.error(error.message)
  next(error)
}

const unknownEndpoint = (request, response) => {
  response.status(404).send({ error: 'unknown endpoint' })
}

app.use(unknownEndpoint)
app.use(errorHandler)

const PORT = process.env.PORT
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})