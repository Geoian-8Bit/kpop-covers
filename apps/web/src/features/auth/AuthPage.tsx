import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, FlipHorizontal2, Gauge, MailCheck, Repeat, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { WaveArt } from '@/components/WaveArt';
import { easeOutExpo, fadeUp, inkReveal, soft, stagger } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

type Mode = 'signin' | 'signup';

const features = [
  { icon: FlipHorizontal2, label: 'Espejo en un toque' },
  { icon: Gauge, label: 'De 0.25× a 2×' },
  { icon: Repeat, label: 'Tramos A–B en bucle' },
  { icon: Users, label: 'Clips compartidos con tu crew' },
];

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const { needsConfirmation } = await signUp(email, password, name || email.split('@')[0] || 'Dancer');
        if (needsConfirmation) setSentTo(email.trim());
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-[1320px] gap-4 p-4 sm:p-6 lg:grid-cols-[1.15fr_1fr] lg:gap-5">
      {/* the print */}
      <motion.figure
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: easeOutExpo }}
        className="paper relative hidden overflow-hidden rounded-[18px] lg:block"
      >
        <WaveArt cover className="absolute inset-0 size-full" />
        <figcaption className="absolute right-6 top-6 flex items-start gap-3">
          <span className="font-display text-[22px] font-bold leading-[1.15] text-sumi-800 [writing-mode:vertical-rl]">
            鏡の中で舞う
          </span>
          <Seal glyph="鏡" size={44} stamp />
        </figcaption>
      </motion.figure>

      <motion.section
        variants={stagger(0.07, 0.15)}
        initial="hidden"
        animate="show"
        className="flex flex-col justify-center gap-8 py-6 lg:px-8"
      >
        <motion.div variants={fadeUp}>
          <Logo />
        </motion.div>

        <div>
          <motion.h1
            variants={inkReveal}
            className="font-display text-[clamp(2.5rem,5.5vw,4.25rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-washi"
          >
            Cada paso, <br />
            en espejo.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-washi-muted">
            El estudio de ensayo de tu crew de K-pop. Pega un enlace de YouTube o sube el vídeo, dale la vuelta, frénalo
            y guarda cada parte de la coreo como clip.
          </motion.p>
          <motion.ul variants={fadeUp} className="mt-5 grid max-w-md grid-cols-2 gap-x-5 gap-y-2.5 text-sm text-washi-muted">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-ai-300" />
                {label}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div variants={fadeUp} className="paper-raised w-full max-w-md rounded-[16px] p-6 sm:p-7">
          <AnimatePresence mode="wait" initial={false}>
            {sentTo ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: soft }}
                exit={{ opacity: 0 }}
                className="py-4 text-center"
              >
                <MailCheck className="mx-auto size-9 text-kin-300" />
                <h2 className="mt-4 font-display text-2xl font-bold">Revisa tu email</h2>
                <p className="mt-2 text-washi-muted">
                  Hemos enviado un enlace de confirmación a <span className="font-medium text-washi">{sentTo}</span>.
                </p>
                <Button
                  variant="secondary"
                  className="mt-6"
                  onClick={() => {
                    setSentTo(null);
                    setMode('signin');
                  }}
                >
                  Volver a entrar
                </Button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={onSubmit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
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
            )}
          </AnimatePresence>
        </motion.div>
      </motion.section>
    </div>
  );
}
