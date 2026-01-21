package com.easydoc.controller;

import com.easydoc.entity.User;
import com.easydoc.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;




@RestController
@CrossOrigin(origins="http://localhost:5173")
@RequestMapping("/api/users")
public class UserController {
    @Autowired
    private UserRepository userRepository;

    /*회원가입*/
    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody User user){
        if(userRepository.findByEmail(user.getEmail()).isPresent()){
            return ResponseEntity.badRequest().body("이미 존재하는 이메일입니다.");
        }
        userRepository.save(user);
        return ResponseEntity.ok("회원가입 성공!");
    }
    
    /*로그인(추후 비밀번호 암호화 예정)*/
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> loginData){
        String email=loginData.get("email");
        String password=loginData.get("password");

        User user=userRepository.findByEmail(email).orElse(null);

        if(user==null||!user.getPassword().equals(password)){
            return ResponseEntity.status(401).body("이메일 또는 비밀번호가 잘못되었습니다.");
        }
        return ResponseEntity.ok("로그인 성공");
    }
    
}



