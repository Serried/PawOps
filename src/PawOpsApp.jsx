import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout.jsx'
import { SessionProvider } from './context/SessionProvider.jsx'
import { AddCareEventPage } from './pages/care/AddCareEventPage.jsx'
import { MyPetsPage } from './pages/pets/MyPetsPage.jsx'
import { AddPetPage, EditPetPage } from './pages/pets/PetFormPages.jsx'
import { PetProfilePage } from './pages/pets/PetProfilePage.jsx'
import { RoutinesPage } from './pages/routines/RoutinesPage.jsx'
import { AlertsPage } from './pages/alerts/AlertsPage.jsx'
import './styles/pawops.css'

// Styles are scoped to .pc-page so Member 1's screens are unaffected
function PetCarePage() {
  return (
    <div className="pc-page">
      <Outlet />
    </div>
  )
}

export default function PawOpsApp({ user, household, onLogout, onSwitchHousehold, membersPage }) {
  return (
    <SessionProvider
      key={household.id}
      user={user}
      household={household}
      onLogout={onLogout}
      onSwitchHousehold={onSwitchHousehold}
    >
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/pets" replace />} />

          <Route element={<PetCarePage />}>
            <Route path="pets" element={<MyPetsPage />} />
            <Route path="pets/new" element={<AddPetPage />} />
            <Route path="pets/:petId" element={<PetProfilePage />} />
            <Route path="pets/:petId/edit" element={<EditPetPage />} />
            <Route path="care/new" element={<AddCareEventPage />} />

            <Route path="routines" element={<RoutinesPage />} />
            <Route path="alerts" element={<AlertsPage />} />
          </Route>

          <Route path="members" element={membersPage} />

          <Route path="*" element={<Navigate to="/pets" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
