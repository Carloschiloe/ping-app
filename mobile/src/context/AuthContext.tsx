import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import * as Localization from 'expo-localization';

type AuthConfig = {
    session: Session | null;
    user: User | null;
    initialized: boolean;
};

const AuthContext = createContext<AuthConfig>({
    session: null,
    user: null,
    initialized: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const syncLocale = async (userId: string) => {
            try {
                const locales = Localization.getLocales();
                if (locales && locales.length > 0) {
                    const { regionCode, languageCode } = locales[0];
                    await supabase
                        .from('profiles')
                        .update({
                            country_code: regionCode,
                            language_code: languageCode
                        })
                        .eq('id', userId);
                }
            } catch (err) {
                console.log('Error syncing locale:', err);
            }
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) syncLocale(session.user.id);
            setInitialized(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) syncLocale(session.user.id);
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ session, user, initialized }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
