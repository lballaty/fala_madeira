// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/auth/AuthScreen.tsx
// Description: Full-screen auth surface (welcome, login, signup, magic link, password reset,
//   OTP verify, update password) extracted from App.tsx. Form state is consolidated into a
//   typed useReducer (ENGINEERING-STANDARDS §2); session state stays in useAuth. Rendered by
//   the App shell whenever there is no user or authMode === 'updatePassword'.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useReducer, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, AlertTriangle, Check } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import { cn } from '../../lib/utils';
import { LegalPage, LegalDocId } from '../legal';
import { Toast, ToastState } from '../../components/Toast';
import { ShowToast } from '../../hooks/useToast';
import { AuthMode } from './useAuth';
import { logger } from '../../lib/logger';

interface AuthFormState {
  authMethod: 'password' | 'magiclink';
  skipVerification: boolean;
  authError: string | null;
  email: string;
  password: string;
  otpCode: string;
  hasAcceptedTerms: boolean;
  hasAcceptedAI: boolean;
}

type AuthFormAction =
  | { type: 'SET_FIELD'; field: 'email' | 'password' | 'otpCode'; value: string }
  | { type: 'SET_METHOD'; method: 'password' | 'magiclink' }
  | { type: 'TOGGLE_SKIP_VERIFICATION' }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_ACCEPTED_TERMS'; value: boolean }
  | { type: 'SET_ACCEPTED_AI'; value: boolean }
  | { type: 'CLEAR_CREDENTIALS' };

const initialFormState: AuthFormState = {
  authMethod: 'password',
  skipVerification: true,
  authError: null,
  email: '',
  password: '',
  otpCode: '',
  hasAcceptedTerms: false,
  hasAcceptedAI: false,
};

const authFormReducer = (state: AuthFormState, action: AuthFormAction): AuthFormState => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_METHOD':
      return { ...state, authMethod: action.method };
    case 'TOGGLE_SKIP_VERIFICATION':
      return { ...state, skipVerification: !state.skipVerification };
    case 'SET_ERROR':
      return { ...state, authError: action.error };
    case 'SET_ACCEPTED_TERMS':
      return { ...state, hasAcceptedTerms: action.value };
    case 'SET_ACCEPTED_AI':
      return { ...state, hasAcceptedAI: action.value };
    case 'CLEAR_CREDENTIALS':
      return { ...state, email: '', password: '', otpCode: '' };
    default:
      return state;
  }
};

interface AuthScreenProps {
  supabase: SupabaseClient | null;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  showToast: ShowToast;
  toast: ToastState | null;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

export const AuthScreen = ({ supabase, authMode, setAuthMode, showToast, toast, handleSupabaseError }: AuthScreenProps) => {
  const [form, dispatch] = useReducer(authFormReducer, initialFormState);
  const { authMethod, skipVerification, authError, email, password, otpCode, hasAcceptedTerms, hasAcceptedAI } = form;
  // Which legal document (Terms / Privacy / AI disclosure) is open from the consent
  // checkboxes; kept outside the form reducer because it is presentation-only.
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocId | null>(null);

  const setAuthError = (error: string | null) => dispatch({ type: 'SET_ERROR', error });

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    logger.debug('login_attempt', 'Handling login', { category: 'SECURITY' });
    if (!supabase) return;
    if (!email || !password) {
      setAuthError("Please enter email and password");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      handleSupabaseError(error, 'handleLogin', 'auth');
      setAuthError(error.message);
    } else {
      logger.info('login_success', 'Login successful', { category: 'SECURITY' });
      setAuthError(null);
    }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    if (!hasAcceptedTerms || !hasAcceptedAI) {
      setAuthError("Please accept the Terms of Service and AI Usage Policy");
      showToast("Please accept the Terms and AI Policy", "error");
      return;
    }

    logger.debug('signup_attempt', 'Handling signup', { category: 'SECURITY' });
    if (!supabase) return;
    if (!email || !password) {
      setAuthError("Please enter email and password");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          has_accepted_terms: hasAcceptedTerms,
          has_accepted_ai_usage: hasAcceptedAI
        }
      }
    });
    if (error) {
      handleSupabaseError(error, 'handleSignup', 'auth');
      setAuthError(error.message);
    } else {
      logger.info('signup_success', 'Signup successful', { category: 'SECURITY', details: { hasSession: !!data.session } });
      setAuthError(null);
      if (data.session && skipVerification) {
        showToast("Welcome to FalaMadeira!", "success");
      } else {
        showToast("Account created! Please check your email for confirmation.", "success");
        if (data.session) await supabase.auth.signOut();
      }
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;
    if (!email) {
      setAuthError("Please enter your email");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      }
    });

    if (error) {
      handleSupabaseError(error, 'handleMagicLink', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Magic link sent! Check your email.", "success");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      handleSupabaseError(error, 'handleResetPassword', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Check email for 6-digit code", "success");
      setAuthMode('verifyOtp');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'recovery'
    });

    if (error) {
      handleSupabaseError(error, 'handleVerifyOtp', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Code verified!", "success");
      setAuthMode('updatePassword');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      handleSupabaseError(error, 'handleUpdatePassword', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Password updated successfully!", "success");
      setAuthMode('login');
      dispatch({ type: 'CLEAR_CREDENTIALS' });
    }
  };

  const getTitle = () => {
    switch (authMode) {
      case 'login': return 'Welcome Back';
      case 'signup': return 'Create Account';
      case 'reset': return 'Reset Password';
      case 'updatePassword': return 'New Password';
      default: return 'FalaMadeira';
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center p-8 bg-surface text-text space-y-8">
      {authMode === 'none' && (
        <>
          <div className="w-24 h-24 bg-ios-blue rounded-3xl flex items-center justify-center text-white shadow-2xl">
            <MessageCircle className="w-12 h-12" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">FalaMadeira</h1>
            <p className="text-ios-gray">Master the Madeiran dialect.</p>
          </div>
        </>
      )}

      {authMode === 'none' ? (
        <div className="w-full max-w-xs space-y-4">
          <button
            onClick={() => {
              logger.debug('auth_mode_selected', 'Login mode selected', { category: 'USER_ACTION' });
              setAuthMode('login');
            }}
            className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20"
          >
            Log In
          </button>
          <button
            onClick={() => {
              logger.debug('auth_mode_selected', 'Signup mode selected', { category: 'USER_ACTION' });
              setAuthMode('signup');
            }}
            className="w-full py-4 bg-card text-ios-blue border border-ios-blue rounded-2xl font-bold"
          >
            Sign Up
          </button>
        </div>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (authMethod === 'magiclink' && (authMode === 'login' || authMode === 'signup')) {
              handleMagicLink(e);
            } else if (authMode === 'login') {
              handleLogin(e);
            } else if (authMode === 'signup') {
              handleSignup(e);
            } else if (authMode === 'reset') {
              handleResetPassword(e);
            } else if (authMode === 'verifyOtp') {
              handleVerifyOtp(e);
            } else {
              handleUpdatePassword(e);
            }
          }}
          className="w-full max-w-xs space-y-4 bg-card p-6 rounded-3xl ios-shadow"
        >
          <h2 className="text-xl font-bold text-center">{getTitle()}</h2>

          {(authMode === 'login' || authMode === 'signup') && (
            <div className="flex p-1 bg-ios-bg rounded-xl">
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_METHOD', method: 'password' })}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                  authMethod === 'password' ? "bg-card shadow-sm text-ios-blue" : "text-ios-gray"
                )}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_METHOD', method: 'magiclink' })}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                  authMethod === 'magiclink' ? "bg-card shadow-sm text-ios-blue" : "text-ios-gray"
                )}
              >
                Magic Link
              </button>
            </div>
          )}

          {authError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-xl flex items-start space-x-2 text-red-600 dark:text-red-300 text-xs animate-pulse">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <div className="space-y-3">
            {(authMode === 'login' || authMode === 'signup' || authMode === 'reset') && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'email', value: e.target.value })}
                className="w-full p-3 bg-ios-bg rounded-xl outline-none text-sm"
                required
              />
            )}
            {authMethod === 'password' && (authMode === 'login' || authMode === 'signup' || authMode === 'updatePassword') && (
              <input
                type="password"
                placeholder={authMode === 'updatePassword' ? "New Password" : "Password"}
                value={password}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'password', value: e.target.value })}
                className="w-full p-3 bg-ios-bg rounded-xl outline-none text-sm"
                required
              />
            )}
            {authMode === 'verifyOtp' && (
              <input
                type="text"
                placeholder="6-digit code"
                value={otpCode}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'otpCode', value: e.target.value })}
                className="w-full p-3 bg-ios-bg rounded-xl outline-none text-sm"
                required
              />
            )}
          </div>

          {authMode === 'signup' && (
            <div className="flex items-center justify-between p-3 bg-ios-bg rounded-xl">
              <span className="text-xs font-medium text-ios-gray">Skip Email Verification</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'TOGGLE_SKIP_VERIFICATION' })}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  skipVerification ? "bg-ios-blue" : "bg-ios-gray/30"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                  skipVerification ? "left-6" : "left-1"
                )} />
              </button>
            </div>
          )}

          {authMode === 'signup' && (
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={hasAcceptedTerms}
                    onChange={(e) => dispatch({ type: 'SET_ACCEPTED_TERMS', value: e.target.checked })}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-ios-gray/30 bg-ios-bg transition-all checked:bg-ios-blue checked:border-ios-blue"
                  />
                  <Check className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                </div>
                <span className="text-[11px] leading-tight text-ios-gray group-hover:text-ios-blue transition-colors">
                  I agree to the <button type="button" onClick={() => setOpenLegalDoc('terms')} className="underline font-bold">Terms of Service</button> and <button type="button" onClick={() => setOpenLegalDoc('privacy')} className="underline font-bold">Privacy Policy</button> (GDPR compliant).
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={hasAcceptedAI}
                    onChange={(e) => dispatch({ type: 'SET_ACCEPTED_AI', value: e.target.checked })}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-ios-gray/30 bg-ios-bg transition-all checked:bg-ios-blue checked:border-ios-blue"
                  />
                  <Check className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                </div>
                <span className="text-[11px] leading-tight text-ios-gray group-hover:text-ios-blue transition-colors">
                  I understand that I am interacting with an <button type="button" onClick={() => setOpenLegalDoc('ai-use')} className="underline font-bold">AI system</button> (EU AI Act disclosure). My data will be used to personalize my learning experience.
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-ios-blue text-white rounded-xl font-bold"
          >
            {authMethod === 'magiclink' && (authMode === 'login' || authMode === 'signup') ? 'Send Magic Link' :
             authMode === 'login' ? 'Log In' :
             authMode === 'signup' ? 'Sign Up' :
             authMode === 'reset' ? 'Send Reset Link' :
             authMode === 'verifyOtp' ? 'Verify Code' :
             'Update Password'}
          </button>

          {authMode === 'login' && authMethod === 'password' && (
            <button
              type="button"
              onClick={() => setAuthMode('reset')}
              className="w-full text-xs text-ios-blue font-bold"
            >
              Forgot Password?
            </button>
          )}

          {authMode === 'signup' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl space-y-2">
              <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium leading-tight">
                💡 <b>Note:</b> If you can't access your email, remember to disable <b>"Confirm Email"</b> in your Supabase Auth Settings.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setAuthMode('none');
              setAuthError(null);
            }}
            className="w-full text-sm text-ios-gray font-medium"
          >
            Cancel
          </button>
        </motion.form>
      )}

      <LegalPage doc={openLegalDoc} onClose={() => setOpenLegalDoc(null)} />

      {toast && <Toast toast={toast} positionClassName="bottom-8" />}
    </div>
  );
};
