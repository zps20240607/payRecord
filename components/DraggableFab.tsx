import React from 'react';
import { StyleSheet, Text, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { useThemedStyles } from '../constants/colors';
import type { AppColors } from '../constants/colors';

const FAB_SIZE = 56;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const EDGE_MARGIN = 12;

interface DraggableFabProps {
  onPress: () => void;
  bottomInset?: number;
}

const createStyles = (c: AppColors) => StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
  },
});

export function DraggableFab({ onPress, bottomInset = 0 }: DraggableFabProps) {
  const styles = useThemedStyles(createStyles);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const moved = useSharedValue(false);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
      moved.value = false;
    })
    .onUpdate((e) => {
      if (Math.abs(e.translationX) > 8 || Math.abs(e.translationY) > 8) moved.value = true;
      offsetX.value = startX.value + e.translationX;
      offsetY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      if (!moved.value) { runOnJS(onPress)(); return; }
      const currentRight = SCREEN_WIDTH - FAB_SIZE - EDGE_MARGIN - offsetX.value;
      const snapX = currentRight > SCREEN_WIDTH / 2 - FAB_SIZE / 2
        ? 0 : -(SCREEN_WIDTH - FAB_SIZE - EDGE_MARGIN * 2);
      const maxUp = -(SCREEN_HEIGHT - FAB_SIZE - EDGE_MARGIN - (28 + bottomInset));
      const clampedY = Math.max(maxUp, Math.min(0, offsetY.value));
      offsetX.value = withSpring(snapX, { damping: 15 });
      offsetY.value = withSpring(clampedY, { damping: 15 });
    });

  const tap = Gesture.Tap().onEnd(() => { runOnJS(onPress)(); });
  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.fab, { bottom: 28 + bottomInset }, animatedStyle]}>
        <Text style={styles.fabText}>+</Text>
      </Animated.View>
    </GestureDetector>
  );
}
