//pass-through vertex shader that passes position to fragment shader
//author: Skeel Lee <skeel@skeelogy.com>

varying vec3 vPosition;

void main() {
    vPosition = position;
    // vPosition.g = 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
}