import { redirect } from 'next/navigation';

// Root redirects to the dashboard; middleware handles unauthenticated users
export default function RootPage() {
  redirect('/dashboard');
}
