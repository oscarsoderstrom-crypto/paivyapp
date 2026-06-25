export type Role           = 'employee' | 'manager' | 'hr-admin';
export type VacationStatus = 'pending' | 'approved' | 'rejected';
export type DayTypeId      = 'office' | 'home' | 'vac-paid' | 'vac-unpaid'
                           | 'sick' | 'trip-dom' | 'trip-int' | 'off';
export type Workweek       = 'mon-fri' | 'mon-sun';
export type HoursMode      = 'set' | 'rolling';

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
  workweek:     Workweek;
  hours_mode:      HoursMode;
  workday_minutes: number;  // total presence incl. lunch
  lunch_minutes:   number;  // unpaid lunch deducted from presence
  team?:        Team;
}

export interface WorkLog {
  id:      string;
  user_id: string;
  date:    string;
  type:    DayTypeId;
  notes?:  string;
  started_at?:     string;  // stamp-in (ISO)
  ended_at?:       string;  // stamp-out (ISO) — auto in 'set' mode, manual in 'rolling'
  worked_minutes?: number;  // paid minutes = presence − lunch
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