/**
 * Каталог механик: единственный источник названий, описаний и бейджей
 * для движка и для экрана «Эффекты» (docs/05 §2.5).
 *
 * Здесь только данные. Математика — в `lib/game/engine.ts`.
 */

export type MechanicPolarity = 'positive' | 'negative' | 'neutral' | 'trap';

export type MechanicKind = 'instant' | 'choice' | 'partner' | 'moderated' | 'buff' | 'debuff';

export type Mechanic = {
  code: string;
  name: string;
  kind: MechanicKind;
  polarity: MechanicPolarity;
  /** Короткая строка для тултипа клетки. */
  tagline: string;
  /** Полное описание для карточки «Эффекты». */
  description: string;
  /** Как применяется: автоматически, по желанию, на другого. */
  application: 'auto' | 'choice' | 'other';
  /** Входит в релиз 12 ноября. */
  core: boolean;
  /** Не может выпасть на клетках 1–5 (все механики — да, поле для UI). */
  note?: string;
};

export const MECHANICS: readonly Mechanic[] = [
  {
    code: '01',
    name: 'Контратака',
    kind: 'instant',
    polarity: 'positive',
    tagline: '+3 клетки вперёд',
    description:
      'Команда перехватывает мяч и убегает в отрыв. Персонаж проскакивает три клетки вперёд. Событие новой клетки не срабатывает — цепочек нет.',
    application: 'auto',
    core: true,
  },
  {
    code: '02',
    name: 'Офсайд',
    kind: 'instant',
    polarity: 'negative',
    tagline: '−2 клетки назад',
    description:
      'Флажок бокового судьи поднят. Возвращаешься на две клетки. Щитки отменяют офсайд, но не лечат уже случившееся.',
    application: 'auto',
    core: true,
  },
  {
    code: '03',
    name: 'Голевая передача',
    kind: 'choice',
    polarity: 'positive',
    tagline: 'отдай +1 другому',
    description:
      'Можно остаться на месте или отдать передачу любому участнику: он шагнёт на клетку вперёд. Пока не выбрал — следующий бросок ждёт.',
    application: 'other',
    core: true,
    note: 'Получатель не запускает событие новой клетки',
  },
  {
    code: '04',
    name: 'Скользкий газон',
    kind: 'debuff',
    polarity: 'negative',
    tagline: '−1 к следующему броску',
    description:
      'Подскользнулся на мокрой траве. Следующий бросок уменьшается на 1, минимум 1. Повторно не складывается в −2.',
    application: 'auto',
    core: true,
    note: 'Снимается Раздевалкой',
  },
  {
    code: '05',
    name: 'Домашние трибуны',
    kind: 'buff',
    polarity: 'positive',
    tagline: '+1 к двум броскам',
    description:
      'Трибуны гонят вперёд. Два следующих броска получают +1. Повторное получение восстанавливает заряд до двух.',
    application: 'auto',
    core: true,
    note: 'Поглощается Жёлтой карточкой',
  },
  {
    code: '06',
    name: 'Щитки',
    kind: 'buff',
    polarity: 'positive',
    tagline: 'отменяет один негатив',
    description:
      'Автоматически отменяет офсайд, скользкий газон или жёлтую карточку. Добровольный риск (VAR, контракт, симуляция) не отменяет.',
    application: 'auto',
    core: true,
    note: 'Один заряд, не накапливается',
  },
  {
    code: '07',
    name: 'Раздевалка',
    kind: 'choice',
    polarity: 'neutral',
    tagline: 'снять негатив или +1',
    description:
      'Есть негативные эффекты — выбери, какой снять. Нет негатива — шаг вперёд. Прошлые откаты и проигрыши не отменяются.',
    application: 'choice',
    core: true,
  },
  {
    code: '08',
    name: 'Жёлтая карточка',
    kind: 'debuff',
    polarity: 'negative',
    tagline: 'поглотит следующее усиление',
    description:
      'Следующее положительное временное усиление (Трибуны, Щитки, Тактика) сгорит, карточка исчезнет. Кубики и мгновенные награды не отбирает.',
    application: 'auto',
    core: true,
  },
  {
    code: '09',
    name: 'VAR',
    kind: 'choice',
    polarity: 'trap',
    tagline: '−1 или риск ±3',
    description:
      'Принять решение — минус клетка. Оспорить — 50 на 50: плюс три или минус три. Вероятности показываются до подтверждения, Щитки не помогают.',
    application: 'choice',
    core: true,
    note: 'Случайность фиксируется сервером',
  },
  {
    code: '10',
    name: 'Тактическая схема',
    kind: 'buff',
    polarity: 'positive',
    tagline: '−1 / 0 / +1 после броска',
    description:
      'Увидел число на кубике — и можешь сдвинуть его на единицу в любую сторону. Не переброс: значение уже сохранено. Минимум одна клетка.',
    application: 'choice',
    core: true,
    note: 'Поглощается Жёлтой карточкой',
  },
  {
    code: '11',
    name: 'Тренировочная база',
    kind: 'moderated',
    polarity: 'positive',
    tagline: '3 удара, 2 попадания → +2',
    description:
      'Три удара по воротам: направление и сила. Два попадания — плюс две клетки. Промах ничего не отнимает.',
    application: 'choice',
    core: false,
  },
  {
    code: '12',
    name: 'Узнай футболиста',
    kind: 'moderated',
    polarity: 'positive',
    tagline: 'до +3 за догадку',
    description:
      'Подсказки открываются по одной: позиция, страна, бывший клуб, текущая команда. Одна попытка. Чем меньше подсказок — тем больше награда.',
    application: 'choice',
    core: false,
  },
  {
    code: '13',
    name: 'Фан-сектор',
    kind: 'moderated',
    polarity: 'neutral',
    tagline: 'задание от админа',
    description:
      'Творческое задание для компании: кричалка, афиша, заголовок. Выполнение подтверждает админ, награда выдаётся один раз.',
    application: 'other',
    core: false,
  },
  {
    code: '14',
    name: 'Ответный матч',
    kind: 'partner',
    polarity: 'neutral',
    tagline: 'серия пенальти',
    description:
      'Вызов другому участнику. Победитель получает +3. Отказ до начала не считается поражением, вызов не блокирует игру.',
    application: 'other',
    core: false,
  },
  {
    code: '15',
    name: 'Последняя минута',
    kind: 'choice',
    polarity: 'trap',
    tagline: 'рискни на +3 или +5',
    description:
      'Начинаешь с +1 и решаешь, продолжать ли. Провал обнуляет только награду события — прошлое и кубики остаются.',
    application: 'choice',
    core: false,
  },
  {
    code: '16',
    name: 'Симуляция',
    kind: 'partner',
    polarity: 'trap',
    tagline: 'честно или нарисовать?',
    description:
      'Атакующий тайно выбирает, играть честно или симулировать; судья решает, проверять ли. Решения раскрываются одновременно.',
    application: 'other',
    core: false,
  },
  {
    code: '17',
    name: 'Контракт тренера',
    kind: 'choice',
    polarity: 'neutral',
    tagline: 'обязательство на завтра',
    description:
      'Обещай ответить на 80% вопросов и угадать две трети. Выполнил — плюс четыре, не выполнил — минус два. Щитки не защищают.',
    application: 'choice',
    core: false,
  },
  {
    code: '18',
    name: 'Джентльменское соглашение',
    kind: 'partner',
    polarity: 'trap',
    tagline: 'сыграть командно или забрать',
    description:
      'Психологическая дуэль: оба тайно выбирают командную игру или личную выгоду. Решения раскрываются одновременно.',
    application: 'other',
    core: false,
  },
] as const;

const BY_CODE = new Map(MECHANICS.map((m) => [m.code, m]));

export function mechanic(code: string | null | undefined): Mechanic | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

export function mechanicName(code: string | null | undefined): string {
  return mechanic(code)?.name ?? 'Обычная клетка';
}

export const CORE_MECHANICS = MECHANICS.filter((m) => m.core);

export const POLARITY_LABEL: Record<MechanicPolarity, string> = {
  positive: 'Позитив',
  negative: 'Негатив',
  neutral: 'Нейтрально',
  trap: 'Ловушка',
};
