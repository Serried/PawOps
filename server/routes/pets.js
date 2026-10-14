import { mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import {
  PET_PHOTO_MAX_BYTES,
  PET_PHOTO_MIME_TYPES,
  PET_SEXES,
  UPLOAD_DIR,
} from '../config.js'
import { badRequest } from '../lib/http-error.js'
import { paramId, toId, Validator } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertHouseholdMember, loadAccessiblePet } from '../services/access.js'
import { createCareEvent, listCareEvents } from '../services/care-events.js'
import {
  archivePet,
  createPet,
  getPet,
  listPets,
  setPhoto,
  updatePet,
} from '../services/pets.js'
import { careEventValues, listQuery } from './care-events.js'

const PET_PHOTO_DIR = path.join(UPLOAD_DIR, 'pets')

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      mkdirSync(PET_PHOTO_DIR, { recursive: true })
      callback(null, PET_PHOTO_DIR)
    },
    filename: (request, file, callback) => {
      const extension = PET_PHOTO_MIME_TYPES[file.mimetype]
      callback(null, `pet-${request.params.petId}-${Date.now()}${extension}`)
    },
  }),
  limits: { fileSize: PET_PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (PET_PHOTO_MIME_TYPES[file.mimetype]) return callback(null, true)
    callback(badRequest('Photo must be a JPG or PNG image'))
  },
})

function petValues(body, { creating }) {
  const v = new Validator(body)
  v.string('name', { required: creating || v.has('name'), max: 60 })
    .string('species', { required: creating || v.has('species'), max: 40 })
    .string('breed', { max: 60 })
    .pastDate('birthDate')
    .number('weightKg', { min: 0, max: 200 })
    .oneOf('sex', PET_SEXES)
    .string('healthNotes', { max: 500 })
    .idList('caretakerIds')
  if (creating) v.id('householdId')
  return v.result()
}

export const petsRouter = Router()
petsRouter.use(requireAuth)

petsRouter.get('/', async (request, response) => {
  const householdId = request.query.householdId ? toId(request.query.householdId) : null
  if (request.query.householdId && householdId === null) {
    throw badRequest('householdId must be a positive integer id')
  }
  if (householdId) await assertHouseholdMember(request.user.id, householdId)
  response.json({ pets: await listPets(request.user.id, householdId) })
})

petsRouter.post('/', async (request, response) => {
  const values = petValues(request.body, { creating: true })
  const pet = await createPet(request.user.id, values)
  response.status(201).location(`/api/pets/${pet.id}`).json({ pet })
})

petsRouter.get('/:petId', async (request, response) => {
  const petId = paramId(request.params.petId, 'Pet')
  response.json({ pet: await getPet(petId, request.user.id) })
})

petsRouter.patch('/:petId', async (request, response) => {
  const petId = paramId(request.params.petId, 'Pet')
  const values = petValues(request.body, { creating: false })
  response.json({ pet: await updatePet(petId, request.user.id, values) })
})

petsRouter.delete('/:petId', async (request, response) => {
  const petId = paramId(request.params.petId, 'Pet')
  await archivePet(petId, request.user.id)
  response.status(204).end()
})

petsRouter.post(
  '/:petId/photo',
  async (request, _response, next) => {
    const petId = paramId(request.params.petId, 'Pet')
    await loadAccessiblePet(petId, request.user.id)
    next()
  },
  upload.single('photo'),
  async (request, response) => {
    if (!request.file) throw badRequest('Choose a photo to upload')
    const storedPath = `pets/${request.file.filename}`
    try {
      const pet = await setPhoto(Number(request.params.petId), request.user.id, storedPath)
      response.json({ pet })
    } catch (error) {
      await unlink(request.file.path).catch(() => {})
      throw error
    }
  },
)

petsRouter.get('/:petId/events', async (request, response) => {
  const petId = paramId(request.params.petId, 'Pet')
  const filters = listQuery(request.query)
  response.json({ events: await listCareEvents(request.user, { ...filters, petId }) })
})

petsRouter.post('/:petId/events', async (request, response) => {
  const petId = paramId(request.params.petId, 'Pet')
  const values = careEventValues(request.body)
  const event = await createCareEvent(request.user, petId, values)
  response.status(201).location(`/api/care-events/${event.id}`).json({ event })
})
