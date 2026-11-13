'use client';

import { useActionState, useState } from 'react';
import { Notice } from '@/components/ui/Panel';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect';
import { updateMyFavoritesAction, type FavoritesActionResult } from '@/lib/actions/favorites';
import type { PlayerView } from '@/lib/types';

type Props = {
  player: PlayerView;
  teams: SearchSelectOption[];
  clubs: SearchSelectOption[];
  players: SearchSelectOption[];
};

export function EditFavorites({ player, teams, clubs, players }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FavoritesActionResult | null, FormData>(
    async (prev, formData) => {
      const res = await updateMyFavoritesAction(prev, formData);
      if (res.ok) setOpen(false);
      return res;
    },
    null,
  );

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
          Изменить любимые
        </button>
        {state?.ok && (
          <div style={{ marginTop: 8 }}>
            <Notice tone="info">{state.message ?? 'Сохранено'}</Notice>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <form action={formAction}>
        <SearchSelect
          name="favoriteNationalTeamId"
          label="Любимая сборная"
          options={teams}
          required
          defaultValue={player.favoriteNationalTeam?.id}
          placeholder="Начните вводить название сборной"
        />
        <SearchSelect
          name="favoriteClubId"
          label="Любимый клуб"
          options={clubs}
          required
          defaultValue={player.favoriteClub?.id}
          placeholder="Начните вводить название клуба"
        />
        <SearchSelect
          name="favoritePlayerId"
          label="Любимый игрок"
          options={players}
          required
          defaultValue={player.favoritePlayer?.id}
          placeholder="Начните вводить имя игрока"
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setOpen(false)} disabled={pending}>
            Отмена
          </button>
        </div>
        {state && !state.ok && (
          <div style={{ marginTop: 8 }}>
            <Notice tone="danger">{state.message}</Notice>
          </div>
        )}
      </form>
    </div>
  );
}
