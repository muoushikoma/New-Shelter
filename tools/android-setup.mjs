// 生成 / 同步安卓工程并打补丁：横屏、全屏沉浸、常亮、图标。npm run android:sync（之后 cd android && ./gradlew assembleDebug）
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, rmSync, mkdirSync } from 'fs';

const run = (c) => execSync(c, { stdio: 'inherit' });
const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
if (!existsSync('android')) run('npx cap add android');
run('npx cap sync android');

// 横屏
const mf = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(mf, 'utf8');
if (!m.includes('screenOrientation')) m = m.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"');
writeFileSync(mf, m);

// 全屏沉浸 + 屏幕常亮
const pkg = cfg.appId;
const dir = `android/app/src/main/java/${pkg.replace(/\./g, '/')}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/MainActivity.java`, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    private void hideBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
`);

// 图标：用像素图标替换默认图标（去掉自适应图标，直接用位图）
rmSync('android/app/src/main/res/mipmap-anydpi-v26', { recursive: true, force: true });
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const to = `android/app/src/main/res/mipmap-${d}`;
  mkdirSync(to, { recursive: true });
  copyFileSync(`build/android/ic_launcher-${d}.png`, `${to}/ic_launcher.png`);
  copyFileSync(`build/android/ic_launcher_round-${d}.png`, `${to}/ic_launcher_round.png`);
}

// 版本号跟 package.json 走
const ver = JSON.parse(readFileSync('package.json', 'utf8')).version;
const code = ver.split('.').reduce((s, x) => s * 100 + Number(x), 0);
const gf = 'android/app/build.gradle';
let g = readFileSync(gf, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${ver}"`);
// 正式签名：环境变量 KEYSTORE_FILE 等存在时才启用（见 .github/workflows/release.yml）
if (!g.includes('KEYSTORE_FILE')) g += `
android {
    signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("KEYSTORE_FILE")) signingConfig signingConfigs.release
        }
    }
}
`;
writeFileSync(gf, g);
console.log(`安卓工程已同步：${pkg} ${ver} (${code})`);
