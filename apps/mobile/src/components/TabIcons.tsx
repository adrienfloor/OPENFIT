import Svg, { Path, Circle, Line } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

/**
 * Inline-SVG bottom-tab icons. Stick to a single 24x24 viewbox + 2px
 * stroke so all four icons share visual weight on the tab bar. Using
 * react-native-svg (already in the build) lets us avoid pulling in an
 * icon font (which would force a prebuild).
 */

export function HomeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ExerciseIcon({ color, size = 24 }: IconProps) {
  // Stylised dumbbell.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 7h2v10H5z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M17 7h2v10h-2z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M3 9.5h2v5H3z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M19 9.5h2v5h-2z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

export function CoachIcon({ color, size = 24 }: IconProps) {
  // Spark / star — represents AI guidance.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M18.4 5.6l-4.2 4.2M9.8 14.2l-4.2 4.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PreferencesIcon({ color, size = 24 }: IconProps) {
  // Sliders — settings without leaning on the cliché gear.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx="9" cy="6" r="2.2" fill={color} />
      <Circle cx="15" cy="12" r="2.2" fill={color} />
      <Circle cx="8" cy="18" r="2.2" fill={color} />
    </Svg>
  );
}
