//GPU version of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uTexelWorldSize;
uniform float uDampingFactor;
uniform float uHorizontalSpeed;
uniform float uDt;

varying vec2 vUv;

void main() {

    //r channel: height
    //g channel: vertical vel

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    float acc = uHorizontalSpeed * uHorizontalSpeed * (
                   texture2D(uTexture,vUv+du).r
                   + texture2D(uTexture,vUv-du).r
                   + texture2D(uTexture,vUv+dv).r
                   + texture2D(uTexture,vUv-dv).r
                   - 4.0 * t.r) / (uTexelWorldSize.x * uTexelWorldSize.x);
    t.g += acc * uDt;  //TODO: use a better integrator
    t.g *= uDampingFactor;

    //update
    t.r += t.g * uDt;  //TODO: use a better integrator

    //write out to texture for next step
    gl_FragColor = t;
}