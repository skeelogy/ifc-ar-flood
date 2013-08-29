//GPU version of HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
//author: Skeel Lee <skeel@skeelogy.com>

//NOTE: I have added in mean height in the calculations, purely because of the flooding system.
//It is not necessary if you do not need to rise the water level.

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform float uDampingFactor;
uniform float uMeanHeight;

varying vec2 vUv;

void main() {

    //r channel: height
    //g channel: vertDeriv
    //b channel: UNUSED
    //a channel: prev mean height

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //remove previous mean height first to bring back to 0 height
    t.r -= t.a;

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    t.g += 0.25 * (texture2D(uTexture,vUv+du).r
                   + texture2D(uTexture,vUv-du).r
                   + texture2D(uTexture,vUv+dv).r
                   + texture2D(uTexture,vUv-dv).r - 4.0 * t.a) - t.r;
    t.g *= uDampingFactor;

    //update
    t.r += t.g;

    //add new mean height
    t.r += uMeanHeight;

    //store new mean height
    t.a = uMeanHeight;

    //write out to texture for next step
    gl_FragColor = t;
}