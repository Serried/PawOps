import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiError } from '../../api/client.js'
import { createPet, removePet, updatePet, uploadPetPhoto } from '../../api/pets.js'
import { Field } from '../../components/Field.jsx'
import { PersonAvatar, PetAvatar } from '../../components/PetAvatar.jsx'
import { useSession } from '../../context/session.js'
import { todayISODate } from '../../lib/format.js'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png'] // design: "JPG or PNG"

function initialValues(pet) {
  return {
    name: pet?.name ?? '',
    species: pet?.species ?? '',
    breed: pet?.breed ?? '',
    birthDate: pet?.birthDate ?? '',
    weightKg: pet?.weightKg ?? '',
    sex: pet?.sex && pet.sex !== 'unknown' ? pet.sex : '',
    healthNotes: pet?.healthNotes ?? '',
  }
}

export function PetForm({ pet, initialError = null }) {
  const editing = Boolean(pet)
  const navigate = useNavigate()
  const { household, members } = useSession()
  const fileInput = useRef(null)

  const [values, setValues] = useState(() => initialValues(pet))
  const [caretakerIds, setCaretakerIds] = useState(() => pet?.caretakers.map((c) => c.id) ?? [])
  const [photo, setPhoto] = useState({ file: null, previewUrl: null })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(initialError)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const displayName = values.name.trim() || pet?.name || 'your pet'

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const toggleCaretaker = (id) => {
    setCaretakerIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  const choosePhoto = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      setFieldErrors((current) => ({ ...current, photo: 'must be a JPG or PNG image' }))
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFieldErrors((current) => ({ ...current, photo: 'must be 2 MB or smaller' }))
      return
    }
    if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    setPhoto({ file, previewUrl: URL.createObjectURL(file) })
    setFieldErrors((current) => ({ ...current, photo: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    setFieldErrors({})

    const payload = {
      name: values.name,
      species: values.species,
      breed: values.breed,
      birthDate: values.birthDate || null,
      weightKg: values.weightKg === '' ? null : values.weightKg,
      sex: values.sex || 'unknown',
      healthNotes: values.healthNotes,
      caretakerIds,
    }

    let saved
    try {
      saved = editing
        ? await updatePet(pet.id, payload)
        : await createPet({ ...payload, householdId: household.id })
    } catch (error) {
      const failure = apiError(error)
      setFieldErrors(failure.fields)
      setFormError(failure.message)
      setSaving(false)
      return
    }

    if (photo.file) {
      try {
        await uploadPetPhoto(saved.id, photo.file)
      } catch (error) {
        // Pet is saved; the photo can be retried from the edit page
        const message = `${saved.name} was saved, but the photo was not: ${apiError(error).message}`
        if (editing) {
          setFormError(message)
          setSaving(false)
        } else {
          navigate(`/pets/${saved.id}/edit`, { state: { error: message } })
        }
        return
      }
    }

    navigate(`/pets/${saved.id}`)
  }

  const remove = async () => {
    setRemoving(true)
    try {
      await removePet(pet.id)
      navigate('/pets')
    } catch (error) {
      setFormError(apiError(error).message)
      setRemoving(false)
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>{editing ? `Edit ${pet.name}` : 'Add Pet'}</h1>
          {editing ? (
            <p className="page-subtitle">
              <Link to={`/pets/${pet.id}`}>{pet.name}</Link> / Edit profile
            </p>
          ) : (
            <p className="page-subtitle">Add your pet to household</p>
          )}
        </div>
      </header>

      <div className="two-column">
        <form className="card form" onSubmit={submit} noValidate>
          {formError && (
            <div className="notice notice--error" role="alert">
              {formError}
            </div>
          )}

          <div className="photo-row">
            <PetAvatar
              pet={{ ...pet, name: values.name }}
              size="lg"
              showInitial={values.name.trim() !== ''}
              previewUrl={photo.previewUrl}
            />
            <div>
              <strong>Pet photo</strong>
              <span className="muted small">JPG or PNG</span>
              <button type="button" className="btn btn--outline btn--small" onClick={() => fileInput.current?.click()}>
                Upload photo
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={PHOTO_TYPES.join(',')}
                onChange={choosePhoto}
                hidden
              />
              {fieldErrors.photo && <span className="field__error">Photo {fieldErrors.photo}</span>}
            </div>
          </div>

          <div className="form-grid">
            <Field label="Name" htmlFor="pet-name" error={fieldErrors.name}>
              <input id="pet-name" value={values.name} onChange={update('name')} maxLength={60} required />
            </Field>
            <Field label="Species" htmlFor="pet-species" error={fieldErrors.species}>
              <input
                id="pet-species"
                value={values.species}
                onChange={update('species')}
                maxLength={40}
                required
              />
            </Field>
            <Field label="Breed" htmlFor="pet-breed" error={fieldErrors.breed}>
              <input id="pet-breed" value={values.breed} onChange={update('breed')} maxLength={60} />
            </Field>
            <Field label="Birthday" htmlFor="pet-birthday" error={fieldErrors.birthDate}>
              <input
                id="pet-birthday"
                type="date"
                value={values.birthDate}
                onChange={update('birthDate')}
                max={todayISODate()}
              />
            </Field>
            <Field label="Weight (kg)" htmlFor="pet-weight" error={fieldErrors.weightKg}>
              <input
                id="pet-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={values.weightKg}
                onChange={update('weightKg')}
              />
            </Field>
            <Field label="Sex" htmlFor="pet-sex" error={fieldErrors.sex}>
              <select id="pet-sex" value={values.sex} onChange={update('sex')}>
                <option value="">Unknown</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </Field>
            <Field label="Health notes" htmlFor="pet-notes" error={fieldErrors.healthNotes} className="form-grid__full">
              <input id="pet-notes" value={values.healthNotes} onChange={update('healthNotes')} maxLength={500} />
            </Field>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add Pet'}
            </button>
            <Link to={editing ? `/pets/${pet.id}` : '/pets'} className="btn btn--outline">
              Cancel
            </Link>
          </div>
        </form>

        <div className="side-stack">
          <div className="card">
            <h2 className="card-title">Caretakers</h2>
            <p className="muted small">Members who look after {displayName}.</p>
            {fieldErrors.caretakerIds && <span className="field__error">{fieldErrors.caretakerIds}</span>}
            <ul className="checklist">
              {members.map((member) => (
                <li key={member.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={caretakerIds.includes(member.id)}
                      onChange={() => toggleCaretaker(member.id)}
                    />
                    <PersonAvatar name={member.name} />
                    <strong>{member.name}</strong>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {editing && (
            <div className="card">
              <h2 className="card-title">Remove pet</h2>
              <p className="muted small">
                Removes {pet.name} and its routines from this household. This cannot be undone.
              </p>
              <button type="button" className="btn btn--danger-outline" onClick={remove} disabled={removing}>
                Remove {pet.name}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
