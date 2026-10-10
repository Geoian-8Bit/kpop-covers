import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

type Mode = 'signin' | 'signup';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await signUp(email, password, name || email.split('@')[0] || 'Dancer');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col items-center justify-center gap-8 px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={soft}
        className="flex flex-col items-center gap-4"
      >
        <Seal glyph="舞" size={84} stamp />
        <h1 className="font-display text-[32px] font-bold tracking-[-0.01em]">One Shoot</h1>
      </motion.div>

      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...soft, delay: 0.2 }}
        className="paper-raised w-full space-y-5 rounded-[18px] p-6 sm:p-8"
      >
        <Segmented
          label="Modo"
          layoutId="auth-mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'signin', label: 'Entrar' },
            { value: 'signup', label: 'Crear cuenta' },
          ]}
          className="w-full [&>button]:flex-1"
        />

        <AnimatePresence initial={false}>
          {mode === 'signup' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={soft}
              className="overflow-hidden"
            >
              <Field
                label="Nombre artístico"
                placeholder="Ej. Mina"
                autoComplete="nickname"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Field
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Contraseña"
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {mode === 'signin' ? 'Entrar al estudio' : 'Crear cuenta'}
          {!busy && <ArrowRight className="size-4.5" />}
        </Button>
      </motion.form>
    </div>
  );
}
