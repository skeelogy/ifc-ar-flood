//Fragment shader that copies data from one channel to another
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec4 uOriginChannelId;
uniform vec4 uDestChannelId;

varying vec2 vUv;

void main() {

    //read texture
    vec4 t = texture2D(uTexture, vUv);

    //get data from origin channel
    float data = dot(t, uOriginChannelId);

    //write to destination channel
    gl_FragColor = (vec4(1.0) - uDestChannelId) * t + uDestChannelId * data;
}