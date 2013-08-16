//GPU version of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uTexelWorldSize;
uniform int uIsDisturbing;
uniform float uDisturbAmount;
uniform float uDisturbRadius;
uniform vec2 uDisturbPos;
uniform float uDampingFactor;
uniform float uHorizontalSpeed;
uniform float uDt;

varying vec2 vUv;

float getDisturbHeight(vec2 uv) {
    float disturb = 0.0;
    if (uIsDisturbing == 1) {
        float len = length(uv - vec2(uDisturbPos.x, 1.0 - uDisturbPos.y));
        disturb = uDisturbAmount * (1.0 - smoothstep(0.0, uDisturbRadius, len));
    }
    return disturb;
}

void main() {

    //NOTE: There are actually multiple steps below, each of which needs synchronization.
    //However, since we are recalculating the disturb height over and over for each neighbour,
    //and that we are reading the old texture for previous frame data (i.e. neighbour data remains the same),
    //the steps below gives the intended results without synchronization.
    //Should test whether multiple render passes is faster or not.

    //r channel: height
    //g channel: vertical vel

    float dt = 1.0 / 60.0;  //temp: setting fixed dt for now...

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //add disturb
    t.r += getDisturbHeight(vUv);

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    float acc = uHorizontalSpeed * uHorizontalSpeed * (
                   texture2D(uTexture,vUv+du).r + getDisturbHeight(vUv+du)
                   + texture2D(uTexture,vUv-du).r + getDisturbHeight(vUv-du)
                   + texture2D(uTexture,vUv+dv).r + getDisturbHeight(vUv+dv)
                   + texture2D(uTexture,vUv-dv).r + getDisturbHeight(vUv-dv)
                   - 4.0 * t.r) / (uTexelWorldSize.x * uTexelWorldSize.x);
    t.g += acc * dt;  //TODO: use a better integrator
    t.g *= uDampingFactor;

    //update
    t.r += t.g * dt;  //TODO: use a better integrator

    //write out to texture for next step
    gl_FragColor = vec4(t.rgb, 1.0);
}