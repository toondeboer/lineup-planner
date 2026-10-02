import type { Formation, Role, Slot } from './types';

/**
 * Builds a formation from rows of roles, listed from attack to defence
 * (the goalkeeper row goes last). Players are spread evenly across each row.
 */
function formation(id: string, name: string, rows: Role[][]): Formation {
  const counts = new Map<Role, number>();
  rows.flat().forEach((role) => counts.set(role, (counts.get(role) ?? 0) + 1));
  const seen = new Map<Role, number>();
  const lastRow = rows.length - 1;
  const slots: Slot[] = rows.flatMap((row, rowIndex) =>
    row.map((role, i): Slot => {
      const n = (seen.get(role) ?? 0) + 1;
      seen.set(role, n);
      return {
        id: counts.get(role)! > 1 ? `${role}${n}` : role,
        role,
        x: Math.round((100 * (i + 1)) / (row.length + 1)),
        y: Math.round(10 + (80 * rowIndex) / lastRow),
      };
    }),
  );
  return { id, name, slots };
}

export const FORMATIONS: Formation[] = [
  formation('433', '4-3-3', [['LW', 'ST', 'RW'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('4231', '4-2-3-1', [['ST'], ['LW', 'AM', 'RW'], ['DM', 'DM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('442', '4-4-2', [['ST', 'ST'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('442d', '4-4-2 diamond', [['ST', 'ST'], ['AM'], ['CM', 'CM'], ['DM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('4141', '4-1-4-1', [['ST'], ['LM', 'CM', 'CM', 'RM'], ['DM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('451', '4-5-1', [['ST'], ['LM', 'CM', 'AM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('4312', '4-3-1-2', [['ST', 'ST'], ['AM'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('4321', '4-3-2-1', [['ST'], ['AM', 'AM'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('352', '3-5-2', [['ST', 'ST'], ['LM', 'CM', 'AM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']]),
  formation('343', '3-4-3', [['LW', 'ST', 'RW'], ['LM', 'CM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']]),
  formation('3421', '3-4-2-1', [['ST'], ['AM', 'AM'], ['LM', 'CM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']]),
  formation('532', '5-3-2', [['ST', 'ST'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('541', '5-4-1', [['ST'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['GK']]),
  formation('4222', '4-2-2-2', [['ST', 'ST'], ['AM', 'AM'], ['DM', 'DM'], ['LB', 'CB', 'CB', 'RB'], ['GK']]),
];

export function getFormation(id: string): Formation {
  const found = FORMATIONS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown formation: ${id}`);
  return found;
}
