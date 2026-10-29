# FitCpu

App web para el celular que cuenta calorías y macros, arma tu plan de la semana y sigue tu progreso de peso. Se instala en la pantalla de inicio como una app (PWA) y funciona sin conexión.

## Qué hace

- **Plan del día**: cinco comidas, arco de calorías con rango de ±10 %, barras de proteína, carbohidratos y grasa, y palomita para marcar lo que ya comiste.
- **Otros nutrientes**: azúcares, fibra, sodio y grasas saturadas contra sus límites, más un score nutricional diario (0–100).
- **Búsqueda de alimentos**: catálogo base de comida mexicana, productos de [Open Food Facts](https://openfoodfacts.org) (también por código de barras con la cámara) y búsqueda con Claude para lo que no aparezca.
- **Semana**: resumen de 7 días, plan semanal generado con Claude según tus metas y preferencias, y copiar un día a otros.
- **Progreso**: objetivo de peso con semanas estimadas, gráfica de peso y calorías promedio.
- **Agua y notas** por día.
- **Animaciones y sonidos**: el arco y las barras se llenan, confeti al entrar a tu rango, sonidos sintetizados con Web Audio (se apagan en Ajustes) y respeto a "reducir movimiento".
- **Respaldo**: descarga e importa tus datos en JSON.

## Cómo calcula las metas

| Concepto | Fórmula |
|---|---|
| Gasto diario | Mifflin-St Jeor × factor de actividad |
| Meta de kcal | Gasto − déficit (1 kg/semana ≈ 1,100 kcal/día), mínimo 1,500 (hombre) o 1,200 (mujer); ritmo máximo 1 % del peso por semana |
| Proteína | 1.5 g × kg de peso meta (al perder grasa) o de peso actual |
| Grasa | 27.5 % de las kcal |
| Carbohidratos | El resto |
| Azúcares (máx.) | 15 % de las kcal |
| Fibra | 38 g (hombre) / 25 g (mujer) |
| Sodio (máx.) | 1.15 mg por kcal |
| Grasa saturada (máx.) | 10 % de las kcal |
| Score diario | kcal en rango 40 + proteína 25 + fibra 15 + azúcar, saturadas y sodio dentro de límite 20 |

También puedes fijar tus propias metas (por ejemplo, las de tu nutriólogo).

## Stack

- [Vite](https://vitejs.dev) + JavaScript sin framework
- [Supabase](https://supabase.com): cuentas y base de datos Postgres con Row Level Security
- [Vercel](https://vercel.com): hosting y funciones de servidor (`/api`) que llaman a la API de Claude
- [Open Food Facts](https://openfoodfacts.org) para productos empacados
- [@zxing/browser](https://github.com/zxing-js/browser) para leer códigos de barras

## Instalación

### 1. Supabase

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql). Crea las tablas y las políticas para que cada usuario solo vea lo suyo.
3. En **Authentication > URL Configuration**, pon la URL de tu app como *Site URL*.
4. Copia de **Project Settings > API** la *Project URL* y la *anon public key*.
5. Opcional: cuando ya tengas tu cuenta, desactiva nuevos registros en **Authentication > Sign In / Providers** si la app es solo para ti.

### 2. Vercel

1. Importa este repositorio en Vercel (detecta Vite solo).
2. En **Settings > Environment Variables** agrega:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon public key de Supabase |
| `SUPABASE_URL` | La misma Project URL |
| `SUPABASE_ANON_KEY` | La misma anon key |
| `ANTHROPIC_API_KEY` | Tu llave de la API de Anthropic (solo servidor) |
| `ALLOWED_EMAILS` | Correos que pueden usar las funciones con Claude, separados por coma |

3. Despliega. Para instalarla en el iPhone: ábrela en Safari > Compartir > **Agregar a pantalla de inicio**.

### Desarrollo local

```bash
npm install
cp .env.example .env.local   # llena las variables VITE_*
npm run dev
```

Sin variables de Supabase la app corre en **modo local** (guarda en el navegador). Las funciones `/api` necesitan `vercel dev`.

## Seguridad

- La llave de Anthropic vive solo en las variables de entorno del servidor; nunca llega al navegador ni al repositorio.
- Las funciones `/api` exigen una sesión válida de Supabase y, si defines `ALLOWED_EMAILS`, solo atienden esos correos.
- La *anon key* de Supabase es pública por diseño; los datos están protegidos por las políticas RLS.

## Créditos

Datos de productos de [Open Food Facts](https://openfoodfacts.org), disponibles bajo la [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Los valores del catálogo base y los que sugiere Claude son aproximados.

FitCpu no sustituye la orientación de un profesional de la salud.

## Licencia

[MIT](LICENSE)
