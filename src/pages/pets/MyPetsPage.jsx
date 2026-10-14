import { Link } from 'react-router-dom'
import { listPets } from '../../api/pets.js'
import { Icon } from '../../components/Icon.jsx'
import { PetAvatar } from '../../components/PetAvatar.jsx'
import { useSession } from '../../context/session.js'
import { useApi } from '../../hooks/useApi.js'
import { formatAge } from '../../lib/format.js'

export function MyPetsPage() {
  const { household } = useSession()
  const pets = useApi(() => listPets(household.id), `pets:${household.id}`)

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>My Pets</h1>
          <p className="page-subtitle">Everyone in {household.name}.</p>
        </div>
        <Link to="/pets/new" className="btn btn--primary">
          <Icon name="plus" size={16} /> Add pet
        </Link>
      </header>

      {pets.error && (
        <div className="notice notice--error" role="alert">
          {pets.error.message}
        </div>
      )}

      {pets.data && pets.data.length > 0 && (
        <ul className="pet-grid">
          {pets.data.map((pet) => (
            <li key={pet.id}>
              <Link to={`/pets/${pet.id}`} className="pet-card card">
                <PetAvatar pet={pet} size="lg" />
                <strong className="pet-card__name">{pet.name}</strong>
                <span className="muted">{[pet.species, pet.breed].filter(Boolean).join(' · ')}</span>
                {formatAge(pet.birthDate) && <span className="muted">{formatAge(pet.birthDate)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
