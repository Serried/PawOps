import { useLocation, useParams } from 'react-router-dom'
import { getPet } from '../../api/pets.js'
import { useApi } from '../../hooks/useApi.js'
import { PetForm } from './PetForm.jsx'

export function AddPetPage() {
  return <PetForm />
}

export function EditPetPage() {
  const { petId } = useParams()
  const location = useLocation()
  const pet = useApi(() => getPet(petId), `pet:${petId}`)

  if (pet.error) {
    return (
      <div className="notice notice--error" role="alert">
        {pet.error.message}
      </div>
    )
  }
  if (!pet.data) return null
  // key resets the form for each pet
  return <PetForm key={pet.data.id} pet={pet.data} initialError={location.state?.error ?? null} />
}
