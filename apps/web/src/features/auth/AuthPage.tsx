import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, FlipHorizontal2, Gauge, Repeat, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { fadeUp, inkReveal, soft, stagger } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

type Mode = 'signin' | 'signup';

const features = [
  { icon: FlipHorizontal2, label: 'Espejo en un toque' },
  { icon: Gauge, label: 'De 0.25× a 2×' },
  { icon: Repeat, label: 'Tramos A–B en bucle' },
  { icon: Users, label: 'Clips compartidos con el grupo' },
];

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
    <div className="mx-auto grid min-h-dvh max-w-[1180px] items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_440px] lg:gap-16">
      <motion.section variants={stagger(0.07, 0.1)} initial="hidden" animate="show">
        <motion.div variants={fadeUp} className="flex items-center gap-4">
          <Seal glyph="舞" size={64} stamp />
          <span className="font-display text-[28px] font-bold">One Shoot</span>
        </motion.div>
        <motion.h1
          variants={inkReveal}
          className="mt-10 font-display text-[clamp(2.6rem,6vw,4.6rem)] font-extrabold leading-[1.02] tracking-[-0.02em]"
        >
          Cada paso,
          <br />
          en espejo.
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-washi-muted">
          El estudio de ensayo del grupo. Pega un enlace de YouTube o sube el vídeo, dale la vuelta, frénalo y guarda
          cada parte de la coreo como clip.
        </motion.p>
        <motion.ul variants={fadeUp} className="mt-6 grid max-w-md grid-cols-2 gap-x-5 gap-y-2.5 text-sm text-washi-muted">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-ai-300" />
              {label}
            </li>
          ))}
        </motion.ul>
      </motion.section>

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
