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
                            language_code: languageCode,
                            last_seen: new Date().toISOString()
                        })
                        .eq('id', userId);
                }
            } catch (err) {
                console.log('Error syncing locale/presence:', err);
            }
        };

        const heartbeat = (userId: string) => {
            return setInterval(async () => {
                await supabase
                    .from('profiles')
                    .update({ last_seen: new Date().toISOString() })
                    .eq('id', userId);
            }, 1000 * 60 * 2); // 2 minutes
        };

        let interval: NodeJS.Timeout;

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                syncLocale(session.user.id);
                interval = heartbeat(session.user.id);
            }
            setInitialized(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                syncLocale(session.user.id);
                if (interval) clearInterval(interval);
                interval = heartbeat(session.user.id);
            } else if (interval) {
                clearInterval(interval);
            }
        });

        return () => {
            subscription.unsubscribe();
            if (interval) clearInterval(interval);
        };
    }, []);

    return (
        <AuthContext.Provider value={{ session, user, initialized }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
