import type { CardRoleGroup } from '@/lib/types';

export const ROLE_LABEL_RU: Record<CardRoleGroup, string> = {
  GK: 'ВРТ',
  DEF: 'ЗАЩ',
  MID: 'ПЗ',
  FWD: 'НАП',
};

export const ROLE_TITLE_RU: Record<CardRoleGroup, string> = {
  GK: 'Вратарь',
  DEF: 'Защитник',
  MID: 'Полузащитник',
  FWD: 'Нападающий',
};

export const RARITY_LABEL_RU: Record<'common' | 'rare' | 'epic' | 'legend', string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legend: 'Легендарная',
};

const TEAM_FLAGS: Record<string, string> = {
  'англия': '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  'england': '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  'бельгия': '🇧🇪',
  'belgium': '🇧🇪',
  'германия': '🇩🇪',
  'germany': '🇩🇪',
  'греция': '🇬🇷',
  'greece': '🇬🇷',
  'дания': '🇩🇰',
  'denmark': '🇩🇰',
  'испания': '🇪🇸',
  'spain': '🇪🇸',
  'италия': '🇮🇹',
  'italy': '🇮🇹',
  'нидерланды': '🇳🇱',
  'netherlands': '🇳🇱',
  'норвегия': '🇳🇴',
  'norway': '🇳🇴',
  'португалия': '🇵🇹',
  'portugal': '🇵🇹',
  'франция': '🇫🇷',
  'france': '🇫🇷',
  'хорватия': '🇭🇷',
  'croatia': '🇭🇷',
};

function normKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function teamFlag(name: string | null | undefined, slug?: string | null): string {
  const bySlug = slug ? TEAM_FLAGS[normKey(slug)] : undefined;
  if (bySlug) return bySlug;
  const byName = TEAM_FLAGS[normKey(name)];
  if (byName) return byName;
  return '🏳️';
}