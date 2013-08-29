//GPU version of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
//author: Skeel Lee <skeel@skeelogy.com>

//NOTE: I have added in mean height in the calculations, purely because of the flooding system.
//It is not necessary if you do not need to rise the water level.

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uTexelWorldSize;
uniform float uDampingFactor;
uniform float uHorizontalSpeed;
uniform float uDt;
uniform float uMeanHeight;

varying vec2 vUv;

void main() {

    //r channel: height
    //g channel: vertical vel
    //b channel: UNUSED
    //a channel: prev mean height

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //remove previous mean height first to bring back to 0 height
    t.r -= t.a;

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    float acc = uHorizontalSpeed * uHorizontalSpeed * (
                   texture2D(uTexture,vUv+du).r
                   + texture2D(uTexture,vUv-du).r
                   + texture2D(uTexture,vUv+dv).r
                   + texture2D(uTexture,vUv-dv).r
                   - 4.0 * t.a - 4.0 * t.r) / (uTexelWorldSize.x * uTexelWorldSize.x);
    t.g += acc * uDt;  //TODO: use a better integrator
    t.g *= uDampingFactor;

    //update
    t.r += t.g * uDt;  //TODO: use a better integrator

    //add new mean height
    t.r += uMeanHeight;

    //store new mean height
    t.a = uMeanHeight;

    //write out to texture for next step
    gl_FragColor = t;
}