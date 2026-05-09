import { SignIn, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { LoginLayout, clerkAppearance } from '@/components/auth';

export function SignInPage() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  // Already signed in elsewhere on the same Clerk instance? Skip the form
  // entirely — Clerk's <SignIn /> won't render in that state and the auto
  // redirect would otherwise ping-pong with ProtectedLayout.
  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  return (
    <LoginLayout
      rightPanel={
        <>
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F1994C] mb-2">
              Sign in
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">MacTech Quality</h1>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              Use your MacTech account to access the QMS dashboard.
            </p>
          </div>
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            forceRedirectUrl="/"
            appearance={clerkAppearance}
          />
        </>
      }
    />
  );
}
