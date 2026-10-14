import { initial } from '../lib/format.js'
import { Icon } from './Icon.jsx'

// Colours follow the design, by the order pets were added
const TONES = ['green', 'rose', 'sand']

export function PetAvatar({ pet, size = 'md', showInitial = false, previewUrl }) {
  const tone = TONES[Math.max(0, (pet?.id ?? 1) - 1) % TONES.length]
  const photo = previewUrl ?? pet?.photoUrl
  return (
    <span className={`pet-avatar pet-avatar--${size} pet-avatar--${tone}`}>
      {photo ? (
        <img src={photo} alt={pet?.name ? `${pet.name}'s photo` : 'Pet photo'} />
      ) : showInitial ? (
        <span className="pet-avatar__initial">{initial(pet?.name || 'M')}</span>
      ) : (
        <Icon name="paw" size={{ sm: 16, md: 24, lg: 40, xl: 52 }[size] ?? 24} />
      )}
    </span>
  )
}

export function PersonAvatar({ name }) {
  return <span className="person-avatar">{initial(name)}</span>
}
