import AsyncStorage from '@react-native-async-storage/async-storage';

// Points to the local hosted Axum Rust SQLite server (e.g. http://localhost:3000)
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

console.log(`🌐 Running in SERVER Mode (connecting to local SQLite hosted backend at ${API_URL})`);

class MockQueryBuilder {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: { column: string; operator: string; value: any }[] = [];
  private insertData: any = null;
  private updateData: any = null;
  private sortField: string | null = null;
  private sortAscending: boolean = true;
  private limitVal: number | null = null;
  private isSingle: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string) {
    this.action = 'select';
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ column: field, operator: 'eq', value });
    return this;
  }

  neq(field: string, value: any) {
    this.filters.push({ column: field, operator: 'neq', value });
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push({ column: field, operator: 'gte', value });
    return this;
  }

  lte(field: string, value: any) {
    this.filters.push({ column: field, operator: 'lte', value });
    return this;
  }

  order(field: string, { ascending = true } = {}) {
    this.sortField = field;
    this.sortAscending = ascending;
    return this;
  }

  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async execute() {
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
      
      const resText = await res.text();
      let result: any = {};
      try {
        result = JSON.parse(resText);
      } catch (e) {
        result = { error: resText };
      }
      if (!res.ok) {
        throw new Error(result.error || 'Query failed');
      }
      return result;
    } catch (err: any) {
      return { data: null, error: err.message || err };
    }
  }

  // Support thenable for direct await calls
  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const mockAuth = {
  signUp: async ({ email, password }: { email: string; password?: string }) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (e) {
        data = { error: resText };
      }
      if (!res.ok) throw new Error(data.error || data.message || 'Signup failed');
      
      const session = { user: data.user };
      await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
      return { data: { user: data.user }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: err.message || err };
    }
  },

  signInWithPassword: async ({ email, phone, password }: { email?: string; phone?: string; password?: string }) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, password })
      });
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (e) {
        data = { error: resText };
      }
      if (!res.ok) throw new Error(data.error || data.message || 'Signin failed');

      const session = { user: data.user };
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

export const supabase = {
  auth: mockAuth,
  from: (table: string) => new MockQueryBuilder(table)
};

export default function SupabaseNonRoute() {
  return null;
}

