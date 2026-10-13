import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/Logo';
import { ButtonSkin } from '@/components/ui/ButtonSkin';

const YT_TERMS = 'https://www.youtube.com/t/terms';
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sep-t px-5 py-6 sm:px-8">
      <h2 className="font-display text-lg font-bold text-washi">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-washi-muted">{children}</div>
    </section>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-kin-300 underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

/** Privacy policy and terms, required by the YouTube API Services policies. Readable without loading the group. */
export function PrivacyPage() {
  return (
    <main className="px-2.5 py-4 sm:px-5 sm:py-8">
      <article className="paper mx-auto max-w-2xl rounded-[10px] sm:rounded-[12px]">
        <header className="flex items-center gap-3 px-5 py-5 sm:px-8">
          <Link
            to="/"
            aria-label="Volver al estudio"
            className="size-11 shrink-0 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] transition-transform hover:scale-105 active:scale-95"
          >
            <ButtonSkin kind="back" />
          </Link>
          <Logo />
        </header>
        <div className="px-5 pb-6 sm:px-8">
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Privacidad y condiciones</h1>
          <p className="mt-1 text-sm text-washi-subtle">Última actualización: 13 de octubre de 2026</p>
        </div>

        <Section title="Qué es One Shoot">
          <p>
            Una herramienta privada y sin ánimo de lucro para que nuestro grupo de covers ensaye coreografías: espejo,
            velocidad, bucles y clips. No hay cuentas ni publicidad.
          </p>
        </Section>

        <Section title="Qué datos guardamos">
          <p>
            Solo lo que el grupo añade: la lista de vídeos (título, artista y el identificador del vídeo de YouTube o el
            archivo subido), los clips (nombre, inicio, fin, velocidad y espejo) y las notas con tiempo (el texto y el
            momento del vídeo). Se guardan en Supabase y los ve todo el que usa la app.
          </p>
          <p>
            En tu dispositivo se guardan preferencias (por ejemplo el bucle o el sonido del metrónomo) y, si subes un
            archivo grande, una copia local. Lo que grabas con la cámara no se sube: se queda en tu dispositivo hasta que
            lo compartes o lo descargas. No usamos analítica ni cookies propias.
          </p>
          <p>
            Al borrar un vídeo, un clip o una nota desde la app deja de verse, pero se archiva: sigue guardado para poder
            recuperarlo si se borró por error. Para borrarlo del todo, pídeselo a quien gestiona el grupo.
          </p>
        </Section>

        <Section title="Fuentes">
          <p>
            Las tipografías se cargan desde Google Fonts. Al abrir la app, tu navegador se conecta a los servidores de
            Google, que reciben tu dirección IP. Consulta la{' '}
            <Ext href={GOOGLE_PRIVACY}>Política de privacidad de Google</Ext>.
          </p>
        </Section>

        <Section title="YouTube">
          <p>
            One Shoot usa los Servicios de API de YouTube para buscar vídeos y el reproductor oficial de YouTube para
            verlos. No descargamos ni guardamos los vídeos de YouTube; de cada búsqueda solo mostramos los resultados,
            que se guardan en caché y pueden servirse durante unas 48 horas como máximo.
          </p>
          <p>
            Al usar la búsqueda o el reproductor aceptas las <Ext href={YT_TERMS}>Condiciones de servicio de YouTube</Ext>.
            Google puede tratar datos según la <Ext href={GOOGLE_PRIVACY}>Política de privacidad de Google</Ext>, por
            ejemplo cookies del reproductor insertado.
          </p>
        </Section>

        <Section title="Contacto">
          <p>Para cualquier duda o para pedir que se borre algo, habla con quien gestiona el grupo.</p>
        </Section>
      </article>
    </main>
  );
}
