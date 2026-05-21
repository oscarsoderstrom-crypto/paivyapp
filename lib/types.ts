export type Role           = 'employee' | 'manager' | 'hr-admin';
export type VacationStatus = 'pending' | 'approved' | 'rejected';
export type DayTypeId      = 'office' | 'home' | 'vac-paid' | 'vac-unpaid' | 'sick' | 'trip-dom' | 'trip-int';

export interface Team {
  id:    string;
  name:  string;
  color: string;
}

export interface Profile {
  id:           string;
  full_name:    string;
  email:        string;
  role:         Role;
  team_id:      string | null;
  accrual_rate: number;
  team?:        Team;
}

export interface WorkLog {
  id:      string;
  user_id: string;
  date:    string;
  type:    DayTypeId;
  notes?:  string;
}

export interface VacationRequest {
  id:           string;
  user_id:      string;
  start_date:   string;
  end_date:     string;
  type:         'paid' | 'unpaid';
  status:       VacationStatus;
  reviewed_by?: string;
  notes?:       string;
  profile?:     Profile;
}

export interface VacationBalance {
  total:     number;
  used:      number;
  remaining: number;
}
