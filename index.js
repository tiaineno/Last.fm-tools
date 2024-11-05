const express = require('express')
const app = express()
require('dotenv').config()
const axios = require('axios')

app.use(express.static('dist'))
app.use(express.json())

const cors = require('cors')
app.use(cors())

const { User, Artist } = require('./models/track')

//check the genres of the given track and return true if they include the given genre
const tagChecker = async (track, genre, dict) => {
  let artist
    
  if (track.artist.includes(',')) {
    artist = encodeURIComponent(track.artist.split(',')[0])
  } else {
    artist = encodeURIComponent(track.artist)
  }

  const key = artist
  if (key in dict) {
    return dict[key].includes(genre)
  }
  const tags = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${artist}&api_key=${process.env.KEY}&format=json`)
  try {
    const taglist = tags.data.toptags.tag
      .filter(tag => tag.count >= 15)
      .map(tag => tag.name)

    dict[key] = taglist
    a = new Artist({
      artist: artist,
      genres: taglist
    })
    a.save()

    return taglist.includes(genre)
  } catch (error) {
    console.log(tags.data)
  }
}

const getRecentTracks = async (username, from, to) => {
  console.log(username)
  let user = await User.findOne({ username: username })
  if (user) {
    console.log('Returning tracks from MongoDB...')
    return user.recentTracks
  }
  return await getRecentTracksApi()
}

//return users whole listening history from api or local storage
const getRecentTracksApi = async (username, from=0, to=Date.now()) => {
  let tracks = []
  let page = 1

  console.log(`Fetching page ${page}...`)
  const firstPage = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&from=${from}&to=${to}&limit=500&user=${username}&page=${page}&api_key=${process.env.KEY}&format=json`)
  const pages_count = parseInt(firstPage.data.recenttracks['@attr']['totalPages'])
  tracks = tracks.concat(firstPage.data.recenttracks.track)

  if (pages_count > 1) {
    for (let p = 2; p <= pages_count; p++) {
      console.log(`Fetching page ${p}...`)
      const pageData = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&from=${from}&to=${to}&limit=500&user=${username}&page=${p}&api_key=${process.env.KEY}&format=json`)
      tracks = tracks.concat(pageData.data.recenttracks.track)
      console.log(`Fetched page ${p}`)
    }
  }
  console.log(tracks.length)

  const formattedTracks = tracks.map(track => ({
    artist: track.artist['#text'],
    title: track.name,
    album: track.album ? track.album['#text'] : 'Unknown Album',
    date: track.date ? new Date(track.date['#text']) : null
  }))

  user = new User({
    username: username,
    recentTracks: formattedTracks
  })

  await user.save()
  console.log('Data saved')
  console.log(formattedTracks.length)
  return formattedTracks
}


// Return every song matching with the given genre from user's entire listening history
app.get('/api/genres/:user/:genre', async (request, response) => {
  const tracks = await getRecentTracks(request.params.user)

  console.log('Processing tracks')
  let results = []
  let dict = {}
  let artists = await Artist.find({})

  artists.forEach(artist => {
    dict[artist.artist] = artist.genres;
  })

  const batchSize = 50

  for (let i = 0; i < tracks.length; i += batchSize) {
    console.log(`Processing tracks ${i}-${i + batchSize}`)
    console.log(tracks)
    const batch = tracks.slice(i, i + batchSize)

    const promises = batch.map(async (track) => {
      const genre = await tagChecker(track, request.params.genre, dict)
      if (genre) {
        return {
          artist: track.artist,
          name: track.title,
          date: track.date
        }
      }
    })

    const filteredTracks = await Promise.all(promises)
    results = results.concat(filteredTracks.filter(track => track !== undefined))
  }

  response.json(results)
})

//return the most listened song of each hour from users entire listening history,
//ignoring the optional parameter ignore
app.get('/api/hours/:user/:ignore?', async (request, response) => {
  const tracks = await getRecentTracks(request.params.user)
  console.log('Processing tracks')
  let dict = {}
  for (let i = 0; i < 24; i++) {
    dict[i] = {}
  }

  for (let i = 0; i < tracks.length; i++) {
    try {
      const key = `${tracks[i].artist} ${tracks[i].title}`
      if (key !== request.params.ignore) {
        const date = new Date(tracks[i].date)
        const hour = date.getHours()
        if (!(key in dict[hour])) {
          dict[hour][key] = 0
        }
        dict[hour][key]+=1
      }
    } catch (error) {
      console.log("error with track", tracks[i].title)
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