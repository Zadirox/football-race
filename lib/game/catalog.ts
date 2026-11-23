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
    tagline: 'Старт +1: рискни до +3, потом до +5',
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
      'Обещай угадать не меньше двух третей ответов завтра. Выполнил — плюс четыре, не выполнил — минус два. Щитки не защищают.',
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
  {
    code: '19',
    name: 'Пак на выбор',
    kind: 'choice',
    polarity: 'positive',
    tagline: 'Выбери пак: Сборные или Клубы',
    description:
      'Попадая на клетку, выбери один пак: «Сборные» или «Клубы». После выбора выбранный пак зачисляется сразу. Пока выбор не сделан, следующий бросок заблокирован.',
    application: 'choice',
    core: false,
    note: 'Выбор сохраняется при перезагрузке (pending action)',
  },
  {
    code: '20',
    name: 'Проклятая бутса',
    kind: 'debuff',
    polarity: 'trap',
    tagline: 'Следующий бросок уйдёт сопернику',
    description:
      'Получаешь проклятую бутсу на 1 следующий бросок. Твой бросок считается как обычно, но движение получает случайный активный соперник, а ты остаёшься на месте. Если соперников нет — сразу +1 клетка.',
    application: 'auto',
    core: false,
  },
  {
    code: '21',
    name: 'Пенальти',
    kind: 'choice',
    polarity: 'neutral',
    tagline: 'Бить рискованно или пасовать надёжно',
    description:
      'Выбор: «Бить» — 70% шанс +3 клетки, 30% шанс 0. «Пас» — +1 клетка гарантированно. Вероятности показываются до выбора. Промах — добровольный риск, Щитки не спасают.',
    application: 'choice',
    core: false,
  },
  {
    code: '22',
    name: 'Прессинг-ловушка',
    kind: 'debuff',
    polarity: 'negative',
    tagline: '−2 к следующему броску',
    description:
      'Следующий бросок получает -2 (минимум 1), действует 1 бросок. Щитки блокируют получение. Раздевалка снимает эффект.',
    application: 'auto',
    core: false,
  },
  {
    code: '23',
    name: 'Дриблинг',
    kind: 'choice',
    polarity: 'neutral',
    tagline: 'Обыграть с риском или сбросить',
    description:
      'Выбор: «Обыграть» — 60% шанс +2 клетки, 40% шанс -1 клетка. «Сбросить мяч» — +1 клетка гарантированно. Плохой исход — добровольный риск, Щитки не спасают.',
    application: 'choice',
    core: false,
  },
  {
    code: '24',
    name: 'Автогол',
    kind: 'instant',
    polarity: 'negative',
    tagline: '−3 клетки',
    description:
      'Невезучий рикошет отбрасывает на 3 клетки назад. Новая клетка не срабатывает. Щитки блокируют эффект.',
    application: 'auto',
    core: false,
  },
  {
    code: '25',
    name: 'Грязное время',
    kind: 'debuff',
    polarity: 'negative',
    tagline: 'Следующий бросок ограничен до 3',
    description:
      'На следующий бросок: если выпало 4 или больше, результат считается как 3. Действует 1 бросок. Щитки блокируют получение. Раздевалка снимает эффект.',
    application: 'auto',
    core: false,
  },
  {
    code: '26',
    name: 'Сломанный бутс',
    kind: 'debuff',
    polarity: 'negative',
    tagline: '−1 на 2 следующих броска',
    description:
      'Следующие 2 броска получают -1 (минимум 1). Щитки блокируют получение. Раздевалка снимает эффект полностью.',
    application: 'auto',
    core: false,
  },
  {
    code: '27',
    name: 'Суперзамена',
    kind: 'choice',
    polarity: 'positive',
    tagline: 'Выбери усиление',
    description:
      'Выбор: «+2 к следующему броску» (1 бросок) или «Щиток» (1 заряд). Если Щиток уже есть, вместо второго Щитка даётся +1 клетка.',
    application: 'choice',
    core: false,
  },
  {
    code: '28',
    name: 'Угловой розыгрыш',
    kind: 'choice',
    polarity: 'neutral',
    tagline: 'Простой розыгрыш или риск',
    description:
      'Выбор: «Простой» — +1 клетка. «Розыгрыш» — 50% шанс +3 клетки, 50% шанс -1 клетка. Вероятности показываются до выбора.',
    application: 'choice',
    core: false,
  },
  {
    code: '29',
    name: 'Фол в штрафной',
    kind: 'choice',
    polarity: 'trap',
    tagline: 'Плохой и очень плохой выбор',
    description:
      'Выбор: «Защититься» — -1 клетка. «Спорить с судьёй» — 50% ничего, 50% -3 клетки. Щитки не спасают от последствий спора.',
    application: 'choice',
    core: false,
  },
  {
    code: '30',
    name: 'Проверка офсайда VAR',
    kind: 'instant',
    polarity: 'neutral',
    tagline: 'Случайный вердикт VAR',
    description:
      'VAR проверяет эпизод: 60% шанс -2 клетки, 40% шанс +2 клетки. Результат определяется сервером и логируется.',
    application: 'auto',
    core: false,
  },
  {
    code: '31',
    name: 'Массовый офсайд',
    kind: 'instant',
    polarity: 'trap',
    tagline: 'Все соперники откатываются',
    description:
      'Все остальные активные не финишировавшие игроки откатываются на 2 клетки назад (не ниже 1). Новые клетки не срабатывают. Ты остаёшься на месте.',
    application: 'auto',
    core: false,
  },
  {
    code: '32',
    name: 'Паника на трибунах',
    kind: 'instant',
    polarity: 'trap',
    tagline: '−1 к следующему броску всем',
    description:
      'Все игроки, включая того, кто наступил на клетку, получают дебафф -1 к следующему броску на 1 заряд (минимум 1).',
    application: 'auto',
    core: false,
  },
  {
    code: '33',
    name: 'Красный VAR',
    kind: 'choice',
    polarity: 'trap',
    tagline: 'Рискованный удар по сопернику',
    description:
      'Выбери активного не финишировавшего соперника: 50% шанс цель получает -3 клетки, 50% шанс ты получаешь -2 клетки. Новые клетки не срабатывают.',
    application: 'choice',
    core: false,
  },
  {
    code: '34',
    name: 'Срыв атаки',
    kind: 'choice',
    polarity: 'negative',
    tagline: 'Сбей соперника впереди',
    description:
      'Выбери активного не финишировавшего соперника впереди: цель получает -2 клетки. Если впереди никого нет — ты получаешь +1 клетку.',
    application: 'choice',
    core: false,
  },
  {
    code: '35',
    name: 'Метеорит на стадионе',
    kind: 'instant',
    polarity: 'trap',
    tagline: 'Случайный хаос на поле',
    description:
      'Случайный активный не финишировавший игрок получает -3 клетки, другой случайный — +2 клетки. Попасть может и тот, кто наступил на клетку. Если игроков мало, эффект деградирует безопасно.',
    application: 'auto',
    core: false,
  },
  {
    code: '36',
    name: 'Бутылка с водой',
    kind: 'instant',
    polarity: 'positive',
    tagline: 'Снимает все негативные дебаффы',
    description:
      'Снимает все негативные дебаффы с тебя. Если снимать нечего — получаешь +2 клетки. Новая клетка не срабатывает.',
    application: 'auto',
    core: false,
  },
  {
    code: '37',
    name: 'Подножка',
    kind: 'instant',
    polarity: 'negative',
    tagline: 'Бьёт по ближайшему лидеру',
    description:
      'Ближайший игрок впереди получает -2 клетки (не ниже 1). Если ты первый — получаешь +1 клетку. Новая клетка не срабатывает.',
    application: 'auto',
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
