import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import RequireAuth from '@/components/layout/RequireAuth';
import { PageTransition } from '@/components/motion/Reveal';
import { Spinner } from '@/components/ui/Feedback';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';

// Each area is its own chunk, so a driver never downloads the owner console.
const Home = lazy(() => import('@/pages/Home'));
const StationDetails = lazy(() => import('@/pages/StationDetails'));
const Booking = lazy(() => import('@/pages/Booking'));
const BookingDetail = lazy(() => import('@/pages/BookingDetail'));
const History = lazy(() => import('@/pages/History'));
const Emergency = lazy(() => import('@/pages/Emergency'));
const MechanicDashboard = lazy(() => import('@/pages/MechanicDashboard'));
const OwnerDashboard = lazy(() => import('@/pages/owner/OwnerDashboard'));
const OwnerMembership = lazy(() => import('@/pages/owner/OwnerMembership'));
const AddStation = lazy(() => import('@/pages/owner/AddStation'));
const ManageSlots = lazy(() => import('@/pages/owner/ManageSlots'));
const BookingRequests = lazy(() => import('@/pages/owner/BookingRequests'));
const Scanner = lazy(() => import('@/pages/owner/Scanner'));

const page = (el) => <PageTransition>{el}</PageTransition>;

export default function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-[60vh]" />}>
      <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<AppShell wide />}>
            <Route index element={<Landing />} />
          </Route>

          <Route element={<AppShell />}>
            {/* Drivers */}
            <Route element={<RequireAuth roles={['user']} />}>
              <Route path="/app" element={page(<Home />)} />
              <Route path="/app/stations/:id" element={page(<StationDetails />)} />
              <Route path="/app/book" element={page(<Booking />)} />
              <Route path="/app/bookings" element={page(<History />)} />
              <Route path="/app/bookings/:id" element={page(<BookingDetail />)} />
              <Route path="/app/emergency" element={page(<Emergency />)} />
            </Route>

            {/* Station owners */}
            <Route element={<RequireAuth roles={['owner']} />}>
              <Route path="/owner" element={page(<OwnerDashboard />)} />
              <Route path="/owner/membership" element={page(<OwnerMembership />)} />
              <Route path="/owner/stations/new" element={page(<AddStation />)} />
              <Route path="/owner/slots" element={page(<ManageSlots />)} />
              <Route path="/owner/requests" element={page(<BookingRequests />)} />
              <Route path="/owner/scanner" element={page(<Scanner />)} />
            </Route>

            {/* Mechanics */}
            <Route element={<RequireAuth roles={['mechanic']} />}>
              <Route path="/mechanic" element={page(<MechanicDashboard />)} />
            </Route>

            {/* Legacy static-page URLs → new routes */}
            <Route path="/pages/*" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
      </Routes>
    </Suspense>
  );
}
