export interface Quota {
  id: string;
  modelName: string;
  remainingPercentage: number;
  refreshTime: string;
  source?: string;
  fetchedAt?: string;
}

export interface Account {
  id: string;
  name: string;
  email?: string;
  lastSyncedAt?: string | null;
  quotas: Quota[];
}

export interface AccountsResponse {
  fetchedAt: string;
  accounts: Account[];
}

export const DEFAULT_ACCOUNTS: Account[] = [
  {id: '1', name: '뉴스피아', email: 'bitget4870@gmail.com', quotas: []},
  {id: '2', name: '사연본색', quotas: []},
  {id: '3', name: '은미', quotas: []},
  {id: '4', name: '트루힐링', quotas: []},
  {id: '5', name: '팩트본색', quotas: []},
  {id: '6', name: 'badamaroo', quotas: []},
  {id: '7', name: 'HAPPY', quotas: []},
  {id: '8', name: 'MOOJA', quotas: []},
];
