import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#555555',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : '#080808',
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          height: isWeb ? 84 : 64 + insets.bottom,
          // top shadow / glow line
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: -1 },
          shadowRadius: 12,
          shadowOpacity: 0.25,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
          ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.4,
          marginBottom: 3,
        },
        tabBarItemStyle: {
          paddingTop: 6,
        },
      }}
    >
      {/* ── الرئيسية ─────────────────────────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? 'house.fill' : 'house'} tintColor={color} size={23} />
            ) : (
              <Feather name="home" size={23} color={color} />
            ),
        }}
      />

      {/* ── استكشاف ──────────────────────────────────────────────── */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'استكشاف',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? 'magnifyingglass.circle.fill' : 'magnifyingglass.circle'} tintColor={color} size={23} />
            ) : (
              <Feather name="compass" size={23} color={color} />
            ),
        }}
      />

      {/* ── الدردشة ───────────────────────────────────────────────── */}
      <Tabs.Screen
        name="chat"
        options={{
          title: 'الدردشة',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'bubble.left.and.bubble.right.fill' : 'bubble.left.and.bubble.right'}
                tintColor={color}
                size={23}
              />
            ) : (
              <Feather name="message-circle" size={23} color={color} />
            ),
        }}
      />

      {/* ── رسائل ─────────────────────────────────────────────────── */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'رسائل',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? 'tray.fill' : 'tray'} tintColor={color} size={23} />
            ) : (
              <Feather name="mail" size={23} color={color} />
            ),
        }}
      />

      {/* ── ملفي ──────────────────────────────────────────────────── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'ملفي',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? 'person.fill' : 'person'} tintColor={color} size={23} />
            ) : (
              <Feather name="user" size={23} color={color} />
            ),
        }}
      />

      {/* ── Hidden ────────────────────────────────────────────────── */}
      <Tabs.Screen name="lfg"      options={{ href: null }} />
      <Tabs.Screen name="factions" options={{ href: null }} />
      <Tabs.Screen name="parties"  options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  androidBg: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1a1a1a',
  },
});
