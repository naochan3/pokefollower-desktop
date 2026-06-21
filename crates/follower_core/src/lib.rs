use std::sync::Mutex;

const ARRIVE_RADIUS_PX: f64 = 6.0;
const SLOW_RADIUS_PX: f64 = 60.0;
const WALK_SPEED_MIN_PXPS: f64 = 80.0;
const WALK_SPEED_MAX_PXPS: f64 = 640.0;
const SPEED_CONFIG_MIN: f64 = 0.05;
const SPEED_CONFIG_MAX: f64 = 0.50;
const IDLE_OFFSET_DIR: Vec2 = Vec2 { x: 0.0, y: -1.0 }; // 待機時はカーソルの真上に寄る（本家拡張と同じ）

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Config {
    pub offset: f64,
    pub lerp: f64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            offset: 70.0,
            lerp: 0.20,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StepOutput {
    pub position: Vec2,
    pub walking: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct FollowerCore {
    config: Config,
    last_mouse: Vec2,
    last_mouse_t: f64,
    position: Vec2,
    target: Vec2,
    offset_dir: Vec2,
    velocity_avg: Vec2,
    speed_avg: f64,
}

impl Default for FollowerCore {
    fn default() -> Self {
        Self {
            config: Config::default(),
            last_mouse: Vec2::default(),
            last_mouse_t: 0.0,
            position: Vec2::default(),
            target: Vec2::default(),
            offset_dir: IDLE_OFFSET_DIR,
            velocity_avg: Vec2::default(),
            speed_avg: 0.0,
        }
    }
}

impl FollowerCore {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            ..Self::default()
        }
    }

    pub fn reset_to(&mut self, x: f64, y: f64, now_ms: f64) {
        self.position = Vec2 { x, y };
        self.target = self.position;
        self.last_mouse = self.position;
        self.last_mouse_t = now_ms;
        self.offset_dir = IDLE_OFFSET_DIR;
        self.velocity_avg = Vec2::default();
        self.speed_avg = 0.0;
    }

    pub fn update_cursor(&mut self, x: f64, y: f64, now_ms: f64) {
        let previous_t = if self.last_mouse_t == 0.0 {
            now_ms
        } else {
            self.last_mouse_t
        };
        let dt = (now_ms - previous_t).max(1.0);
        let vx = (x - self.last_mouse.x) * (1000.0 / dt);
        let vy = (y - self.last_mouse.y) * (1000.0 / dt);
        const SMOOTHING: f64 = 0.2;
        self.velocity_avg.x = self.velocity_avg.x * (1.0 - SMOOTHING) + vx * SMOOTHING;
        self.velocity_avg.y = self.velocity_avg.y * (1.0 - SMOOTHING) + vy * SMOOTHING;
        self.speed_avg = hypot(self.velocity_avg.x, self.velocity_avg.y);
        self.last_mouse = Vec2 { x, y };
        self.last_mouse_t = now_ms;
    }

    pub fn step(&mut self, dt_ms: f64) -> StepOutput {
        self.compute_target();
        let dx = self.target.x - self.position.x;
        let dy = self.target.y - self.position.y;
        let dist = hypot(dx, dy);
        let mut walking = false;
        if dist > ARRIVE_RADIUS_PX {
            let ws = self.walk_speed_from_config();
            let sp = if dist < SLOW_RADIUS_PX {
                ws * (dist / SLOW_RADIUS_PX)
            } else {
                ws
            };
            let mdt = dt_ms.min(50.0);
            let md = dist.min(sp * (mdt / 1000.0));
            self.position.x += (dx / dist) * md;
            self.position.y += (dy / dist) * md;
            walking = true;
        }
        StepOutput {
            position: self.position,
            walking,
        }
    }

    fn walk_speed_from_config(&self) -> f64 {
        let t = (self.config.lerp - SPEED_CONFIG_MIN) / (SPEED_CONFIG_MAX - SPEED_CONFIG_MIN);
        let c = t.clamp(0.0, 1.0);
        WALK_SPEED_MIN_PXPS + c * (WALK_SPEED_MAX_PXPS - WALK_SPEED_MIN_PXPS)
    }

    fn compute_target(&mut self) {
        let has_dir = self.speed_avg > 40.0;
        // 移動中だけ offset_dir を進行方向の逆へ更新。停止中は凍結＝直前の隅に留まる。
        if has_dir {
            let dx = -(self.velocity_avg.x / self.speed_avg.max(1.0));
            let dy = -(self.velocity_avg.y / self.speed_avg.max(1.0));
            const OFFSET_DIR_LERP: f64 = 0.08;
            self.offset_dir.x += (dx - self.offset_dir.x) * OFFSET_DIR_LERP;
            self.offset_dir.y += (dy - self.offset_dir.y) * OFFSET_DIR_LERP;
        }
        self.target.x = self.last_mouse.x + self.offset_dir.x * self.config.offset;
        self.target.y = self.last_mouse.y + self.offset_dir.y * self.config.offset;
    }
}

fn hypot(x: f64, y: f64) -> f64 {
    (x * x + y * y).sqrt()
}

static CORE: Mutex<FollowerCore> = Mutex::new(FollowerCore {
    config: Config {
        offset: 70.0,
        lerp: 0.20,
    },
    last_mouse: Vec2 { x: 0.0, y: 0.0 },
    last_mouse_t: 0.0,
    position: Vec2 { x: 0.0, y: 0.0 },
    target: Vec2 { x: 0.0, y: 0.0 },
    offset_dir: IDLE_OFFSET_DIR,
    velocity_avg: Vec2 { x: 0.0, y: 0.0 },
    speed_avg: 0.0,
});
static LAST_STEP: Mutex<StepOutput> = Mutex::new(StepOutput {
    position: Vec2 { x: 0.0, y: 0.0 },
    walking: false,
});

#[no_mangle]
pub extern "C" fn pf_set_config(offset: f64, lerp: f64) {
    CORE.lock().expect("follower core lock").config = Config { offset, lerp };
}

#[no_mangle]
pub extern "C" fn pf_reset_to(x: f64, y: f64, now_ms: f64) {
    CORE.lock()
        .expect("follower core lock")
        .reset_to(x, y, now_ms);
    *LAST_STEP.lock().expect("follower step lock") = StepOutput {
        position: Vec2 { x, y },
        walking: false,
    };
}

#[no_mangle]
pub extern "C" fn pf_update_cursor(x: f64, y: f64, now_ms: f64) {
    CORE.lock()
        .expect("follower core lock")
        .update_cursor(x, y, now_ms);
}

#[no_mangle]
pub extern "C" fn pf_step(dt_ms: f64) {
    let next = CORE.lock().expect("follower core lock").step(dt_ms);
    *LAST_STEP.lock().expect("follower step lock") = next;
}

#[no_mangle]
pub extern "C" fn pf_x() -> f64 {
    LAST_STEP.lock().expect("follower step lock").position.x
}

#[no_mangle]
pub extern "C" fn pf_y() -> f64 {
    LAST_STEP.lock().expect("follower step lock").position.y
}

#[no_mangle]
pub extern "C" fn pf_walking() -> i32 {
    i32::from(LAST_STEP.lock().expect("follower step lock").walking)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_idle_is_above_cursor() {
        let mut core = FollowerCore::default();
        core.reset_to(100.0, 100.0, 0.0);
        let mut out = core.step(16.0);
        for _ in 0..119 {
            out = core.step(16.0);
        }
        // 一度も動かしていなければ初期 offset_dir（真上）のまま。
        assert!((out.position.x - 100.0).abs() < 10.0, "{out:?}");
        assert!(out.position.y < 50.0, "{out:?}");
    }

    #[test]
    fn idle_after_move_stays_at_trailing_corner() {
        let mut core = FollowerCore::default();
        core.reset_to(500.0, 500.0, 0.0);
        let mut now = 0.0;
        let (mut cx, mut cy) = (500.0_f64, 500.0_f64);
        // 右下へ移動 → ペットは左上へ trail。
        for _ in 0..60 {
            now += 16.0;
            cx += 12.0;
            cy += 12.0;
            core.update_cursor(cx, cy, now);
            core.step(16.0);
        }
        // 停止して十分待つ。offset_dir は凍結され左上の隅に留まる。
        let mut out = core.step(16.0);
        for _ in 0..180 {
            now += 16.0;
            core.update_cursor(cx, cy, now);
            out = core.step(16.0);
        }
        assert!(out.position.x - cx < -20.0, "{out:?}");
        assert!(out.position.y - cy < -20.0, "{out:?}");
    }

    #[test]
    fn moving_cursor_follows_behind_motion_direction() {
        let mut core = FollowerCore::default();
        core.reset_to(0.0, 0.0, 0.0);
        let mut out = core.step(16.0);
        let mut now = 0.0;
        for _ in 0..600 {
            now += 16.0;
            core.update_cursor(800.0, 0.0, now);
            out = core.step(16.0);
        }
        assert!(out.position.x > 700.0, "{out:?}");
    }
}
