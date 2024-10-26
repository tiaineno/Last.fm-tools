const mongoose = require('mongoose')

mongoose.set('strictQuery', false)

const url = process.env.MONGODB_URI

console.log('connecting to', url)
mongoose.connect(url)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connecting to MongoDB:', error.message)
  })

const trackSchema = mongoose.Schema({
  artist: String,
  title: String,
  album: String,
  date: Date
})
const userSchema = new mongoose.Schema({
  username: String,
  recentTracks: [trackSchema]
})

const artistSchema = new mongoose.Schema({
  artist: String,
  genres: [String]
})

userSchema.set('toJSON', {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString()
    delete returnedObject._id
    delete returnedObject.__v
  }
})

artistSchema.set('toJSON', {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString()
    delete returnedObject._id
    delete returnedObject.__v
  }
})

const User = mongoose.model('User', userSchema)
const Artist = mongoose.model('Artist', artistSchema)

module.exports = { User, Artist }