import AsyncStorage from '@react-native-async-storage/async-storage';

// Determine if we should connect to a real server or run in offline demo mode.
// If EXPO_PUBLIC_API_URL is set, we use server mode, otherwise we use offline AsyncStorage mode.
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const RUN_IN_OFFLINE_MODE = !API_URL;

console.log(
  RUN_IN_OFFLINE_MODE 
    ? '📶 Running in OFFLINE DEMO Mode (using AsyncStorage)' 
    : `🌐 Running in SERVER Mode (connecting to ${API_URL})`
);

// --- SEED DATA (For Offline Mode Only) ---
const DEFAULT_USERS = [
  { id: "a9olyw", email: "cloud@gmail.com", password: "cloud123" },
  { id: "mnwe3l", email: "aditya@gmail.com", password: "aditya123" }
];

const DEFAULT_PROFILES = [
  { 
    id: "a9olyw", 
    full_name: "Cloud", 
    role: "student", 
    verification_status: "approved", 
    phone: "9876543210", 
    languages: JSON.stringify(["English", "Hindi"]),
    dob: "2005-08-15",
    emergency_phone: "9111122222",
    education_level: "High School"
  },
  { 
    id: "mnwe3l", 
    full_name: "Aditya", 
    role: "scribe", 
    verification_status: "approved", 
    phone: "8888888888", 
    languages: JSON.stringify(["English", "Hindi"]),
    education_level: "Undergraduate",
    occupation: "Student Scribe",
    location: "gota",
    availability_slots: "Morning, Afternoon"
  }
];

const DEFAULT_EXAMS = [
  {
    id: 12,
    student_id: "a9olyw",
    student_name: "Cloud",
    dob: "2005-08-15",
    education_grade: "High School",
    phone: "9876543210",
    emergency_phone: "9111122222",
    exam_type: "Secondary",
    exam_language: "English",
    id_proof: "Aadhar Verified",
    status: "pending",
    scribe_id: null,
    subject: "Physics-I",
    exam_date: "2026-07-10 10:00 AM",
    exam_venue: "Main Hall, Centre A",
    created_at: new Date().toISOString()
  },
  {
    id: 13,
    student_id: "a9olyw",
    student_name: "Cloud",
    dob: "2005-08-15",
    education_grade: "High School",
    phone: "9876543210",
    emergency_phone: "9111122222",
    exam_type: "Secondary",
    exam_language: "English",
    id_proof: "Aadhar Verified",
    status: "pending",
    scribe_id: null,
    subject: "English Literature",
    exam_date: "2026-07-12 02:00 PM",
    exam_venue: "Room 302, Block B",
    created_at: new Date().toISOString()
  }
];

// Helper to initialize database in AsyncStorage if empty (Offline Mode)
async function initLocalDB() {
  if (!RUN_IN_OFFLINE_MODE) return;
  if (typeof window === 'undefined') return; // Guard for Node SSR environment
  const rawUsers = await AsyncStorage.getItem('db_users');
  const parsedUsers = rawUsers ? JSON.parse(rawUsers) : [];
  if (parsedUsers.length === 0) {
    await AsyncStorage.setItem('db_users', JSON.stringify(DEFAULT_USERS));
    await AsyncStorage.setItem('db_profiles', JSON.stringify(DEFAULT_PROFILES));
    await AsyncStorage.setItem('db_exam_requests', JSON.stringify(DEFAULT_EXAMS));
    await AsyncStorage.setItem('db_scribe_applications', JSON.stringify([]));
    await AsyncStorage.setItem('db_notifications', JSON.stringify([]));
    await AsyncStorage.setItem('db_chat_messages', JSON.stringify([]));
    await AsyncStorage.setItem('local_db_initialized', 'true');
    console.log('Client-side mock database initialized with seed data.');
  }
}

if (typeof window !== 'undefined') {
  initLocalDB();
}

// Mock Query Builder that speaks either to the Server API or runs in AsyncStorage offline
class MockQueryBuilder {
  private table: string;
  private dbKey: string;
  private filters: Array<{ column: string; value: any; operator?: string }> = [];
  private sortField: string | null = null;
  private sortAscending: boolean = true;
  private limitVal: number | null = null;
  private isSingle: boolean = false;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private updateData: any = null;
  private insertData: any = null;

  constructor(table: string) {
    this.table = table;
    this.dbKey = `db_${table}`;
  }

  select(columns: string = '*') {
    this.action = 'select';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ column, value, operator: 'neq' });
    return this;
  }

  order(column: string, { ascending = true } = {}) {
    this.sortField = column;
    this.sortAscending = ascending;
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  insert(row: any) {
    this.action = 'insert';
    this.insertData = row;
    return this;
  }

  update(updates: any) {
    this.action = 'update';
    this.updateData = updates;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  async execute() {
    if (typeof window === 'undefined') {
      return { data: this.isSingle ? null : [], error: null };
    }
    // --- SERVER MODE ---
    if (!RUN_IN_OFFLINE_MODE) {
      try {
        const data = this.action === 'insert' ? this.insertData : (this.action === 'update' ? this.updateData : undefined);
        const res = await fetch(`${API_URL}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: this.table,
            action: this.action,
            filters: this.filters,
            data,
            sortField: this.sortField,
            sortAscending: this.sortAscending,
            limit: this.limitVal,
            single: this.isSingle
          })
        });
        
        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'Query failed');
        }
        return result;
      } catch (err: any) {
        return { data: null, error: err.message || err };
      }
    }

    // --- OFFLINE MODE ---
    try {
      await initLocalDB();
      const rawData = await AsyncStorage.getItem(this.dbKey);
      let list = rawData ? JSON.parse(rawData) : [];

      if (this.action === 'select') {
        for (const filter of this.filters) {
          list = list.filter((item: any) => {
            if (filter.operator === 'neq') {
              return String(item[filter.column]) !== String(filter.value);
            }
            return String(item[filter.column]) === String(filter.value);
          });
        }

        if (this.sortField) {
          const field = this.sortField;
          const asc = this.sortAscending;
          list.sort((a: any, b: any) => {
            if (a[field] < b[field]) return asc ? -1 : 1;
            if (a[field] > b[field]) return asc ? 1 : -1;
            return 0;
          });
        }

        if (this.limitVal !== null) {
          list = list.slice(0, this.limitVal);
        }

        list = list.map((item: any) => {
          if (item.languages && typeof item.languages === 'string') {
            try {
              item.languages = JSON.parse(item.languages);
            } catch (e) {}
          }
          return item;
        });

        if (this.isSingle) {
          return { data: list[0] || null, error: null };
        }
        return { data: list, error: null };
      }

      else if (this.action === 'insert') {
        const row = { ...this.insertData };

        if (this.table === 'users' || this.table === 'profiles') {
          if (!row.id) {
            row.id = Math.random().toString(36).substring(2, 10);
          }
        } else {
          const maxId = list.reduce((max: number, item: any) => (item.id > max ? item.id : max), 0);
          row.id = maxId + 1;
        }

        if (!row.created_at) {
          row.created_at = new Date().toISOString();
        }

        if (row.languages && Array.isArray(row.languages)) {
          row.languages = JSON.stringify(row.languages);
        }

        list.push(row);
        await AsyncStorage.setItem(this.dbKey, JSON.stringify(list));

        const returnRow = { ...row };
        if (returnRow.languages && typeof returnRow.languages === 'string') {
          try {
            returnRow.languages = JSON.parse(returnRow.languages);
          } catch (e) {}
        }

        return { data: returnRow, error: null };
      }

      else if (this.action === 'update') {
        const updates = { ...this.updateData };

        if (updates.languages && Array.isArray(updates.languages)) {
          updates.languages = JSON.stringify(updates.languages);
        }

        list = list.map((item: any) => {
          let match = true;
          for (const filter of this.filters) {
            if (filter.operator === 'neq') {
              if (String(item[filter.column]) === String(filter.value)) match = false;
            } else {
              if (String(item[filter.column]) !== String(filter.value)) match = false;
            }
          }

          if (match) {
            return { ...item, ...updates };
          }
          return item;
        });

        await AsyncStorage.setItem(this.dbKey, JSON.stringify(list));
        return { data: null, error: null };
      }

      else if (this.action === 'delete') {
        list = list.filter((item: any) => {
          let match = true;
          for (const filter of this.filters) {
            if (filter.operator === 'neq') {
              if (String(item[filter.column]) === String(filter.value)) match = false;
            } else {
              if (String(item[filter.column]) !== String(filter.value)) match = false;
            }
          }
          return !match;
        });

        await AsyncStorage.setItem(this.dbKey, JSON.stringify(list));
        return { data: null, error: null };
      }

      return { data: null, error: 'Invalid Action' };
    } catch (err: any) {
      return { data: null, error: err.message || err };
    }
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// Mock Authentication using local list or HTTP API depending on mode
const mockAuth = {
  signUp: async ({ email, password }: { email: string; password?: string }) => {
    // --- SERVER MODE ---
    if (!RUN_IN_OFFLINE_MODE) {
      try {
        const res = await fetch(`${API_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');
        
        const session = { user: data.user };
        await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
        return { data: { user: data.user }, error: null };
      } catch (err: any) {
        return { data: { user: null }, error: err.message || err };
      }
    }

    // --- OFFLINE MODE ---
    try {
      await initLocalDB();
      const rawUsers = await AsyncStorage.getItem('db_users');
      const users = rawUsers ? JSON.parse(rawUsers) : [];

      if (users.some((u: any) => u.email === email)) {
        throw new Error('User already exists');
      }

      const id = Math.random().toString(36).substring(2, 10);
      const newUser = { id, email, password };
      users.push(newUser);
      await AsyncStorage.setItem('db_users', JSON.stringify(users));

      const session = { user: { id, email } };
      await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
      return { data: { user: { id, email } }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: err.message || err };
    }
  },

  signInWithPassword: async ({ email, phone, password }: { email?: string; phone?: string; password?: string }) => {
    // --- SERVER MODE ---
    if (!RUN_IN_OFFLINE_MODE) {
      try {
        const res = await fetch(`${API_URL}/api/auth/signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, phone, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signin failed');

        const session = { user: data.user };
        await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
        return { data: session, error: null };
      } catch (err: any) {
        return { data: { user: null }, error: err.message || err };
      }
    }

    // --- OFFLINE MODE ---
    try {
      await initLocalDB();
      const rawUsers = await AsyncStorage.getItem('db_users');
      const users = rawUsers ? JSON.parse(rawUsers) : [];

      let matchedUser = null;

      if (phone) {
        const rawProfiles = await AsyncStorage.getItem('db_profiles');
        const profiles = rawProfiles ? JSON.parse(rawProfiles) : [];
        const profile = profiles.find((p: any) => p.phone === phone);
        if (profile) {
          matchedUser = users.find((u: any) => u.id === profile.id && u.password === password);
        }
      } else if (email) {
        matchedUser = users.find((u: any) => u.email === email && u.password === password);
      }

      if (!matchedUser) {
        throw new Error('Invalid credentials');
      }

      const session = { user: { id: matchedUser.id, email: matchedUser.email } };
      await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
      return { data: session, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: err.message || err };
    }
  },

  getSession: async () => {
    try {
      const val = await AsyncStorage.getItem('local_db_session');
      const session = val ? JSON.parse(val) : null;
      return { data: { session }, error: null };
    } catch (err: any) {
      return { data: { session: null }, error: err.message || err };
    }
  },

  signOut: async () => {
    try {
      await AsyncStorage.removeItem('local_db_session');
      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  }
};

// Export the mock client under the same "supabase" name
export const supabase = {
  auth: mockAuth,
  from: (table: string) => new MockQueryBuilder(table)
};
