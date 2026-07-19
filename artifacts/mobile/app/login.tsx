import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('يرجى ملء جميع الحقول');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (result.requiresTwoFactor) {
        setNeeds2FA(true);
        setIsLoading(false);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (err: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        err instanceof Error
          ? err.message.includes('401') || err.message.includes('Invalid')
            ? 'اسم المستخدم أو كلمة المرور غير صحيحة'
            : err.message.includes('suspended')
            ? 'حسابك موقوف'
            : 'حدث خطأ، حاول مجدداً'
          : 'حدث خطأ، حاول مجدداً';
      setError(message);
      setIsLoading(false);
    }
  };

  if (needs2FA) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <View style={styles.twoFaContainer}>
          <Feather name="shield" size={48} color={colors.primary} />
          <Text style={[styles.twoFaTitle, { color: colors.foreground }]}>
            التحقق الثنائي مفعّل
          </Text>
          <Text style={[styles.twoFaBody, { color: colors.mutedForeground }]}>
            حسابك محمي بالتحقق الثنائي. يرجى استخدام تطبيق الويب لإتمام تسجيل الدخول.
          </Text>
          <Pressable
            onPress={() => setNeeds2FA(false)}
            style={[styles.backBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.backBtnText, { color: colors.foreground }]}>
              العودة
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={[styles.logoBox, { borderColor: colors.primary }]}>
            <Text style={[styles.logoText, { color: colors.primary }]}>GWH</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Game World Hub
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            منصة اللاعبين الاجتماعية
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error && (
            <View style={[styles.errorBox, { backgroundColor: '#1a0000', borderColor: colors.destructive }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {error}
              </Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              اسم المستخدم
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.input, borderColor: colors.border },
              ]}
            >
              <Feather name="user" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="اسم المستخدم"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
                testID="login-username"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              كلمة المرور
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.input, borderColor: colors.border },
              ]}
            >
              <Feather name="lock" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                testID="login-password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.loginBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed || isLoading ? 0.8 : 1,
              },
            ]}
            testID="login-submit"
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.loginBtnText, { color: colors.primaryForeground }]}>
                تسجيل الدخول
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          سجّل من تطبيق الويب للحصول على حساب
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 32,
  },
  brand: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 20,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
  },
  form: {
    gap: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
  },
  loginBtn: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 50,
  },
  loginBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
  },
  twoFaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  twoFaTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  twoFaBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
