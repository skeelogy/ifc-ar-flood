//Fragment shader to combine textures: multiply texture1 with alpha channel of texture2
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;  //for alpha channel

varying vec2 vUv;

void main() {

    //read textures
    vec4 t1 = texture2D(uTexture1, vUv);
    vec4 t2 = texture2D(uTexture2, vUv);

    //multiply all channels of t1 with alpha of t2
    t1 *= t2.a;

    gl_FragColor = t1;
}