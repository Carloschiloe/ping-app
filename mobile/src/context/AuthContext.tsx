import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import * as Localization from 'expo-localization';
import { clearOfflineMessageQueue } from '../utils/offlineQueueStorage';

type AuthConfig = {
    session: Session | null;
    user: User | null;
    initialized: boolean;
    profile: AuthProfile | null;
    profileComplete: boolean | null;
    refreshProfile: () => Promise<AuthProfile | null>;
};

export type AuthProfile = {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
};

const AuthContext = createContext<AuthConfig>({
    session: null,
    user: null,
    initialized: false,
    profile: null,
    profileComplete: null,
    refreshProfile: async () => null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [profile, setProfile] = useState<AuthProfile | null>(null);
    const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

    const loadProfile = useCallback(async (userId: string): Promise<AuthProfile | null> => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, full_name, avatar_url, phone')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('[Auth] profile load failed', {
                code: error.code || null,
                detailsPresent: !!error.details,
            });
            setProfile(null);
            setProfileComplete(false);
            return null;
        }

        const nextProfile = (data || null) as AuthProfile | null;
        setProfile(nextProfile);
        setProfileComplete(!!nextProfile?.full_name?.trim());
        return nextProfile;
    }, []);

    const refreshProfile = useCallback(async () => {
        if (!user?.id) return null;
        return loadProfile(user.id);
    }, [loadProfile, user?.id]);

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
                console.warn('Error syncing locale/presence', err);
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

        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                await loadProfile(session.user.id);
                syncLocale(session.user.id);
                interval = heartbeat(session.user.id);
            } else {
                setProfile(null);
                setProfileComplete(null);
            }
            setInitialized(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (event === 'SIGNED_OUT') {
                void clearOfflineMessageQueue().catch(() => {
                    console.warn('Unable to clear offline queue after sign-out');
                });
            }
            if (session?.user) {
                void loadProfile(session.user.id);
                syncLocale(session.user.id);
                if (interval) clearInterval(interval);
                interval = heartbeat(session.user.id);
            } else {
                if (interval) clearInterval(interval);
                setProfile(null);
                setProfileComplete(null);
            }
        });

        return () => {
            subscription.unsubscribe();
            if (interval) clearInterval(interval);
        };
    }, [loadProfile]);

    return (
        <AuthContext.Provider value={{ session, user, initialized, profile, profileComplete, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
