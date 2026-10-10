import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Logo } from '@/components/Logo';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { fadeUp, inkReveal, stagger } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';

export function OnboardingPage() {
  const { crews, createCrew, joinCrew } = useCrew();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [crewName, setCrewName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [errors, setErrors] = useState<{ create?: string; join?: string }>({});

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy('create');
    setErrors({});
    try {
      const crew = await createCrew(crewName);
      toast(`Crew “${crew.name}” creada`, 'success');
      navigate('/');
    } catch (err) {
      setErrors({ create: friendlyError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    setBusy('join');
    setErrors({});
    try {
      const crew = await joinCrew(code);
      toast(`Te uniste a “${crew.name}”`, 'success');
      navigate('/');
    } catch (err) {
      setErrors({ join: friendlyError(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-6">
      <div className="flex items-center justify-between">
        <Logo />
        {crews.length > 0 ? (
          <Link to="/" className="flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-washi-muted hover:text-washi">
            <ArrowLeft className="size-4" /> Volver
          </Link>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        )}
      </div>

      <motion.div variants={stagger(0.08, 0.05)} initial="hidden" animate="show" className="flex flex-1 flex-col justify-center py-12">
        <motion.h1
          variants={inkReveal}
          className="max-w-2xl font-display text-[clamp(2.2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.02em]"
        >
          Monta tu crew o únete a la tuya.
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-4 max-w-xl text-washi-muted">
          Todo lo que subáis, vídeos y clips, se comparte entre los miembros de la crew.
        </motion.p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <motion.form variants={fadeUp} onSubmit={onCreate} className="paper flex flex-col rounded-[16px] p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <Seal glyph="組" size={40} />
              <h2 className="font-display text-xl font-bold">Crear una crew</h2>
            </div>
            <p className="mt-2 text-sm text-washi-muted">Recibirás un código para invitar al resto.</p>
            <Field
              className="mt-5"
              label="Nombre de la crew"
              placeholder="Ej. Velvet Steps"
              required
              maxLength={60}
              value={crewName}
              onChange={(e) => setCrewName(e.target.value)}
              error={errors.create}
            />
            <Button type="submit" className="mt-5 self-start" loading={busy === 'create'} disabled={!crewName.trim()}>
              Crear crew
            </Button>
          </motion.form>

          <motion.form variants={fadeUp} onSubmit={onJoin} className="paper flex flex-col rounded-[16px] p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <Seal glyph="入" size={40} tone="enji" />
              <h2 className="font-display text-xl font-bold">Tengo un código</h2>
            </div>
            <p className="mt-2 text-sm text-washi-muted">Pídeselo a quien creó la crew.</p>
            <Field
              className="mt-5 [&_input]:font-mono [&_input]:uppercase [&_input]:tracking-[0.3em]"
              label="Código de invitación"
              placeholder="A1B2C3D4"
              required
              maxLength={8}
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              error={errors.join}
            />
            <Button
              type="submit"
              variant="washi"
              className="mt-5 self-start"
              loading={busy === 'join'}
              disabled={code.trim().length < 8}
            >
              Unirme
            </Button>
          </motion.form>
        </div>
      </motion.div>
    </div>
  );
}
