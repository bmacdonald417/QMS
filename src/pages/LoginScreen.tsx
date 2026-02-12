import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email').max(120, 'Too long'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Too long'),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginScreen() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-100 flex items-stretch justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
        className="w-full max-w-6xl flex flex-col md:flex-row overflow-hidden rounded-2xl border border-[#333333] bg-[#121212]/90 shadow-2xl shadow-black/60"
      >
        <BrandingPanel />
        <AuthPanel />
      </motion.div>
    </div>
  );
}

function BrandingPanel() {
  return (
    <div className="relative hidden md:flex md:flex-col md:w-1/2 bg-gradient-to-br from-[#050505] via-[#101010] to-black border-r border-[#262626] px-10 py-8">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#007AFF] to-[#28CD41] flex items-center justify-center shadow-depth-md">
          <span className="text-sm font-bold text-white">MT</span>
        </div>
        <div>
          <p className="text-xs tracking-[0.16em] uppercase text-gray-500">MacTech Solutions LLC</p>
          <p className="text-sm text-gray-300">Integrated TQMS / QAMS Platform</p>
        </div>
      </div>

      <div className="mt-10 space-y-6">
        <h1 className="text-2xl font-semibold text-white leading-snug">
          Operational confidence for{' '}
          <span className="text-[#007AFF]">mission‑critical</span> programs.
        </h1>
        <p className="text-sm text-gray-400 max-w-md leading-relaxed">
          MacTech Solutions helps federal programs and defense contractors achieve authorization,
          audit readiness, and operational confidence through integrated technical and risk-aware
          delivery. We bridge the gap between cybersecurity, infrastructure, and compliance for
          mission-critical programs.
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-8 text-xs text-gray-500">
        <span>© {new Date().getFullYear()} MacTech Solutions LLC</span>
        <span>Quality • Security • Compliance</span>
      </div>

      <div className="pointer-events-none absolute inset-0 -z-10 opacity-50">
        <div className="absolute -right-32 top-10 h-72 w-72 rounded-full bg-[#007AFF]/15 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#28CD41]/12 blur-3xl" />
      </div>
    </div>
  );
}

function AuthPanel() {
  return (
    <div className="w-full md:w-1/2 flex items-center justify-center px-6 py-8 md:px-10 md:py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center gap-3 md:hidden">
          <img
            src="https://www.mactechsolutionsllc.com/_next/image?url=%2Fmactech.png&w=256&q=75"
            alt="MacTech Solutions"
            className="h-10 w-auto"
          />
          <div>
            <p className="text-xs tracking-[0.16em] uppercase text-gray-500">MacTech Solutions LLC</p>
            <p className="text-sm text-gray-300">Integrated TQMS / QAMS Platform</p>
          </div>
        </div>

        <div>
          <p className="text-xs tracking-[0.18em] uppercase text-gray-500 mb-2">
            Secure Quality Portal
          </p>
          <h2 className="text-xl md:text-2xl font-semibold text-white">Sign in to MacTech QMS</h2>
          <p className="mt-2 text-sm text-gray-500">
            Enter your enterprise credentials to access the Total Quality & Assurance Management
            suite.
          </p>
        </div>

        <AuthForm />

        <p className="mt-6 text-[11px] leading-relaxed text-gray-500">
          This is a restricted system. Authorized access only. All activities are logged for
          compliance with GxP and ISO 9001/17025 standards.
        </p>
      </div>
    </div>
  );
}

function AuthForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
    mode: 'onChange',
  });

  const onSubmit = async (values: LoginFormValues) => {
    const result = await login(values.email, values.password);
    if (result.ok) {
      navigate('/', { replace: true });
    } else {
      setError('root', { type: 'manual', message: result.error });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {errors.root?.message && (
        <p className="text-sm text-compliance-red" role="alert">
          {errors.root.message}
        </p>
      )}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@organization.gov"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="w-full">
        <label htmlFor="password" className="label-caps block mb-1.5">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            className={`w-full rounded-lg border bg-surface-elevated pl-3 pr-10 py-2 text-gray-100 placeholder-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-mactech-blue focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 ${
              errors.password
                ? 'border-compliance-red focus:ring-compliance-red'
                : 'border-surface-border hover:border-gray-500'
            }`}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-mactech-blue focus:ring-offset-2 focus:ring-offset-surface-elevated"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {errors.password?.message && (
          <p id="password-error" className="mt-1 text-xs text-compliance-red" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border border-[#333] bg-transparent text-[#007AFF] focus:ring-1 focus:ring-[#007AFF]"
            defaultChecked
            {...register('rememberMe')}
          />
          <span className="uppercase tracking-[0.16em] text-[10px] text-gray-500">
            Remember Me
          </span>
        </label>
        <button
          type="button"
          className="text-[11px] font-medium text-[#A0C9FF] hover:text-[#C6DDFF] transition-colors"
        >
          Forgot password?
        </button>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={isSubmitting}
        className="w-full justify-center rounded-xl bg-gradient-to-r from-[#007AFF] to-[#3D9DFF] hover:from-[#1B7FFF] hover:to-[#51A8FF] shadow-depth-md"
      >
        Sign In
      </Button>
    </form>
  );
}

