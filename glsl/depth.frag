//Fragment shader to set RGB colors based on depth.
//The one that comes with Three.js is clamped to 1 and is non-linear, so I have to create my own version.
//author: Skeel Lee <skeel@skeelogy.com>

uniform float uNear;
uniform float uFar;

void main() {
    float color = mix(uFar, uNear, gl_FragCoord.z/gl_FragCoord.w);
    gl_FragColor = vec4(vec3(color), 1.0);
}