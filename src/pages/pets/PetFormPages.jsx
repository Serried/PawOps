import { useLocation, useParams } from 'react-router-dom'
import { getPet } from '../../api/pets.js'
import { PageLoading, RequestError } from '../../components/AsyncState.jsx'
import { useApi } from '../../hooks/useApi.js'
import { PetForm } from './PetForm.jsx'

export function AddPetPage() {
  return <PetForm />
}

export function EditPetPage() {
  const { petId } = useParams()
  const location = useLocation()
  const pet = useApi(() => getPet(petId), `pet:${petId}`)

  if (pet.loading) return <PageLoading label="Loading pet profile…" />
  if (pet.error) return <RequestError error={pet.error} resourceName="Pet" onRetry={pet.reload} backTo="/pets" backLabel="Back to pets" />
  // key resets the form for each pet
  return <PetForm key={pet.data.id} pet={pet.data} initialError={location.state?.error ?? null} />
}
