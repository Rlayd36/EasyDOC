package com.easydoc.entity;

import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter @Setter
@Table(name="users")
public class User {
    @Id
    @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Long id;

    @Column(nullable=false, unique=true)
    private String email;

    @Column(nullable=false)
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) 
    private String password;

    @Column(nullable=false)
    private String name;

    @CreationTimestamp
    @Column(name="join_date", updatable=false)
    private LocalDateTime joinDate;
}