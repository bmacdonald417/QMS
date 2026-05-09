import { SignUp, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { LoginLayout, clerkAppearance } from '@/components/auth';

export function SignUpPage() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  return (
    <LoginLayout
      rightPanel={
        <>
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F1994C] mb-2">
              Create account
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">MacTech Quality</h1>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              Continue with Google or use your email below.
            </p>
          </div>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            forceRedirectUrl="/"
            appearance={clerkAppearance}
          />
        </>
      }
    />
  );
}
