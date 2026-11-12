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
      'Перехватили мяч и побежали в атаку — ты сразу прыгаешь на 3 клетки вперёд. На новой клетке событие не включается, так что цепочки не получаются.',
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
      'Лайнсмен поднял флажок — возвращаешься на 2 клетки назад. «Щитки» могут отменить офсайд, но то, что уже случилось раньше, не исправят.',
    application: 'auto',
    core: true,
  },
  {
    code: '03',
    name: 'Голевая передача',
    kind: 'choice',
    polarity: 'positive',
    tagline: 'можно отдать +1 другому',
    description:
      'Можешь остаться на месте или отдать пас любому игроку — он продвинется на 1 клетку вперёд. Пока не выберешь, бросить кубик снова нельзя.',
    application: 'other',
    core: true,
    note: 'У того, кто получил пас, событие новой клетки не запускается',
  },
  {
    code: '04',
    name: 'Скользкий газон',
    kind: 'debuff',
    polarity: 'negative',
    tagline: '−1 к следующему броску',
    description:
      'Подскользнулся на мокрой траве. Следующий бросок будет на 1 меньше (но не меньше 1). Эффект не складывается в −2.',
    application: 'auto',
    core: true,
    note: '«Раздевалка» может снять этот эффект',
  },
  {
    code: '05',
    name: 'Домашние трибуны',
    kind: 'buff',
    polarity: 'positive',
    tagline: '+1 к двум броскам',
    description:
      'Трибуны подгоняют вперёд: два следующих броска будут на +1. Если эффект получишь ещё раз, у тебя снова будет 2 заряда.',
    application: 'auto',
    core: true,
    note: 'Если есть «Жёлтая карточка», она заберёт это усиление',
  },
  {
    code: '06',
    name: 'Щитки',
    kind: 'buff',
    polarity: 'positive',
    tagline: 'отменяют один плохой эффект',
    description:
      'Один раз автоматически спасают от офсайда, скользкого газона или жёлтой карточки. На добровольный риск (VAR, контракт, симуляция) не действуют.',
    application: 'auto',
    core: true,
    note: 'Один заряд, не копится',
  },
  {
    code: '07',
    name: 'Раздевалка',
    kind: 'choice',
    polarity: 'neutral',
    tagline: 'снять плохой эффект или +1',
    description:
      'Если есть плохой эффект — можно выбрать, какой снять. Если плохих эффектов нет, просто шагнёшь на 1 клетку вперёд. То, что уже произошло раньше, не отменяется.',
    application: 'choice',
    core: true,
  },
  {
    code: '08',
    name: 'Жёлтая карточка',
    kind: 'debuff',
    polarity: 'negative',
    tagline: 'заберёт следующее усиление',
    description:
      'Следующее хорошее временное усиление («Трибуны», «Щитки», «Тактика») сгорит, и карточка исчезнет. Кубики и разовые награды она не забирает.',
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
      'Принять решение судьи — минус 1 клетка. Оспорить — 50 на 50: плюс 3 или минус 3 клетки. Шансы видны заранее, «Щитки» тут не помогут.',
    application: 'choice',
    core: true,
    note: 'Результат решается честно на сервере',
  },
  {
    code: '10',
    name: 'Тактическая схема',
    kind: 'buff',
    polarity: 'positive',
    tagline: 'после броска: −1 / 0 / +1',
    description:
      'После броска видно число — и можно сдвинуть его на 1 вверх или вниз. Это не переброс: число уже выпало. Меньше 1 клетки сделать нельзя.',
    application: 'choice',
    core: true,
    note: 'Если есть «Жёлтая карточка», она заберёт это усиление',
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
