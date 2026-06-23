export type Role           = 'employee' | 'manager' | 'hr-admin';
export type VacationStatus = 'pending' | 'approved' | 'rejected';
export type DayTypeId      = 'office' | 'home' | 'vac-paid' | 'vac-unpaid'
                           | 'sick' | 'trip-dom' | 'trip-int' | 'off';
export type Workweek       = 'mon-fri' | 'mon-sun';

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
  team?:        Team;
}

export interface WorkLog {
  id:          string;
  user_id:     string;
  date:        string;
  type:        DayTypeId;
  notes?:      string;
  start_time?: string | null;
  end_time?:   string | null;
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

export interface AppSettings {
  time_tracking_enabled: boolean;
}